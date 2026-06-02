/**
 * SEO Meta Description Batch (SEO/content sprint — Item 2)
 *
 * Takes a tenant's EXISTING WordPress posts + pages and batch-generates SEO
 * meta descriptions for the ones that are missing / weak, then writes them
 * back via the proven Yoast + Rank Math REST fields (mirrors the publish path
 * in controllers/hosting/outputs.ts).
 *
 * Invoked by monthlyTaskExecutor's runSeoMetaBatchAdapter AFTER the user has
 * approved the task — so this performs real external writes, but only inside
 * the platform's per-task approval contract (see [[feedback_no_automatic_actions]]).
 *
 * Idempotent by construction: a written meta description is ≥100 chars, so a
 * re-run no longer sees it as "weak" and skips it.
 */
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { agentIntegrations } from '@/db/schema'
import { getApiKeyForInstance, resolveDirectModel } from '@/controllers/hosting/agentSetup'

// Empty OR shorter than this many chars counts as "weak" → candidate for rewrite.
const WEAK_META_THRESHOLD = 100
// Hard cap on writes per run — controls API spend + WP write volume. A second
// approved run picks up the next batch (the written ones are no longer weak).
const MAX_UPDATES_PER_RUN = 25
// How many WP REST pages (100 items each) we scan looking for candidates.
const MAX_SCAN_PAGES = 5
// Posts per single Anthropic generation call (one call returns N descriptions).
const GEN_CHUNK_SIZE = 8

export interface WpCfg {
    url: string
    user: string
    appPassword: string
}

type WpContentType = 'posts' | 'pages'

interface WpItem {
    type: WpContentType
    id: number
    title: string
    link: string
    excerpt: string                // plain-text, stripped
    currentMeta: string            // resolved from yoast / rank math / '' if none
}

export interface SeoMetaBatchResult {
    ok: boolean
    integrationMissing: boolean
    detectorAvailable: boolean     // could we read current meta via a SEO plugin's REST?
    authError: boolean             // writes rejected 401/403 — app password invalid or header stripped
    scanned: number
    candidates: number
    updated: Array<{ type: WpContentType; id: number; title: string; link: string; metaDescription: string }>
    failures: Array<{ type: WpContentType; id: number; error: string }>
    error?: string
}

// ─── WP REST helpers (self-contained — wpCompanionInstaller's are module-private) ──

function authHeader(cfg: WpCfg): string {
    return 'Basic ' + Buffer.from(`${cfg.user}:${cfg.appPassword}`).toString('base64')
}

function normalizeUrl(url: string): string {
    return url.replace(/\/+$/, '')
}

function stripHtml(s: string): string {
    return String(s || '').replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Resolve the WordPress integration config for this instance/agent from the
 * agent_integrations table. Mirrors the match priority used in outputs.ts:
 * agent.id → first row. Returns null when no usable config exists.
 */
export async function loadWpConfig(instanceId: string, agentId?: string | null): Promise<WpCfg | null> {
    const rows = await db.select().from(agentIntegrations).where(
        and(
            eq(agentIntegrations.instanceId, instanceId),
            eq(agentIntegrations.integrationType, 'wordpress'),
        ),
    )
    if (rows.length === 0) return null
    const match = (agentId ? rows.find(r => r.agentId === agentId) : undefined) || rows[0]
    const cfg = (match.config as Record<string, unknown> | null) || {}
    // Accept both writer shapes ({user,appPassword} and {username,password}) —
    // same defensive read as integrationGate.ts / the publish path.
    const url = typeof cfg.url === 'string' ? cfg.url : ''
    const user = (typeof cfg.user === 'string' ? cfg.user : '') || (typeof cfg.username === 'string' ? cfg.username : '')
    const appPassword = (typeof cfg.appPassword === 'string' ? cfg.appPassword : '') || (typeof cfg.password === 'string' ? cfg.password : '')
    if (!url || !user || !appPassword) return null
    return { url, user, appPassword }
}

/**
 * List published posts/pages and resolve each one's current meta description.
 * Paginates up to MAX_SCAN_PAGES per content type. Returns the weak/empty ones
 * as candidates plus whether a SEO-plugin signal was readable at all.
 */
async function listWeakItems(cfg: WpCfg): Promise<{ candidates: WpItem[]; scanned: number; detectorAvailable: boolean }> {
    const base = normalizeUrl(cfg.url)
    const candidates: WpItem[] = []
    let scanned = 0
    let detectorAvailable = false

    for (const type of ['posts', 'pages'] as WpContentType[]) {
        for (let page = 1; page <= MAX_SCAN_PAGES; page++) {
            const url = `${base}/wp-json/wp/v2/${type}?per_page=100&page=${page}&status=publish&_fields=id,title,link,excerpt,yoast_head_json,meta`
            let res: Response
            try {
                res = await fetch(url, { headers: { Authorization: authHeader(cfg) }, signal: AbortSignal.timeout(30000) })
            } catch (err) {
                throw new Error(`WP GET ${type} p${page} failed: ${(err as Error).message}`)
            }
            // page beyond last → WP returns 400 rest_post_invalid_page_number; stop cleanly
            if (res.status === 400) break
            if (!res.ok) {
                const txt = await res.text().catch(() => '')
                throw new Error(`WP GET ${type} → ${res.status}: ${txt.slice(0, 200)}`)
            }
            const items = await res.json().catch(() => []) as Array<{
                id?: number
                title?: { rendered?: string }
                link?: string
                excerpt?: { rendered?: string }
                yoast_head_json?: { description?: string }
                meta?: Record<string, unknown>
            }>
            if (!Array.isArray(items) || items.length === 0) break

            for (const it of items) {
                if (typeof it.id !== 'number') continue
                scanned++
                const yoastDesc = typeof it.yoast_head_json?.description === 'string' ? it.yoast_head_json.description : undefined
                const rankMathDesc = it.meta && typeof it.meta.rank_math_description === 'string' ? it.meta.rank_math_description as string : undefined
                // Did this item expose ANY SEO-plugin meta signal? If yes, we can
                // trust currentMeta; if no item ever does, we fall back to excerpt.
                if (yoastDesc !== undefined || (it.meta && 'rank_math_description' in it.meta)) detectorAvailable = true

                const excerpt = stripHtml(it.excerpt?.rendered || '')
                const currentMeta = (yoastDesc || rankMathDesc || '').trim()
                candidates.push({
                    type,
                    id: it.id,
                    title: stripHtml(it.title?.rendered || `#${it.id}`),
                    link: it.link || '',
                    excerpt,
                    currentMeta,
                })
            }
            if (items.length < 100) break   // last page
        }
    }

    // Decide which are weak. With a readable SEO plugin, trust currentMeta length.
    // Without one (detectorAvailable=false), we cannot see current meta, so use the
    // excerpt as a conservative proxy — only items with an empty excerpt qualify,
    // to avoid clobbering descriptions we cannot inspect.
    const weak = candidates.filter(it =>
        detectorAvailable
            ? it.currentMeta.length < WEAK_META_THRESHOLD
            : it.excerpt.length === 0,
    )
    return { candidates: weak, scanned, detectorAvailable }
}

/**
 * Generate Hebrew meta descriptions for a chunk of items in a single call.
 * Returns a Map<id, metaDescription>. Best-effort — missing/short entries are
 * dropped by the caller so a partial generation still writes what it got.
 */
async function generateChunk(
    apiKey: string,
    model: string,
    businessName: string,
    items: WpItem[],
): Promise<Map<number, string>> {
    const out = new Map<number, string>()
    const list = items.map(it => ({
        id: it.id,
        title: it.title,
        snippet: it.excerpt.slice(0, 400),
    }))
    const prompt = `אתם עורך SEO של ${businessName}. עבור כל עמוד ברשימה, כתבו תיאור מטא (meta description) בעברית בלבד.

## חוקים
- בדיוק 140-160 תווים לכל תיאור. לא פחות, לא יותר.
- 100% עברית. אפס מילים באנגלית (חוץ משמות מותג רשמיים).
- כל תיאור ייחודי, מפתה לקליק, ומשלב מילת מפתח טבעית מתוך כותרת העמוד.
- בלי גרשיים כפולים בתוך הטקסט, בלי שורות חדשות.

## עמודים
${JSON.stringify(list, null, 2)}

## תפוקה — JSON בלבד, ללא טקסט נוסף
{
  "descriptions": [
    { "id": <מזהה העמוד>, "metaDescription": "<140-160 תווים בעברית>" }
  ]
}`

    const body: Record<string, unknown> = {
        model,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
    })
    if (!res.ok) {
        console.warn(`[seoMetaBatch] generate chunk API ${res.status}`)
        return out
    }
    const data = await res.json() as { content?: Array<{ type?: string; text?: string }> }
    const text = (data.content?.find(c => c.type === 'text')?.text || '').trim()
    const first = text.indexOf('{')
    const last = text.lastIndexOf('}')
    if (first < 0 || last < 0) return out
    try {
        const parsed = JSON.parse(text.substring(first, last + 1)) as { descriptions?: Array<{ id?: number; metaDescription?: string }> }
        for (const d of parsed.descriptions || []) {
            if (typeof d.id === 'number' && typeof d.metaDescription === 'string') {
                const meta = d.metaDescription.trim().replace(/\s+/g, ' ')
                if (meta.length >= 80) out.set(d.id, meta.slice(0, 170))
            }
        }
    } catch (err) {
        console.warn(`[seoMetaBatch] parse chunk failed:`, (err as Error).message)
    }
    return out
}

/**
 * Write a meta description to a single post/page via WP REST.
 *
 * Writes the underlying Yoast + Rank Math post-meta keys via the core `meta`
 * field. These keys are protected/custom and NOT REST-writable by default —
 * the Flowmatic companion plugin (v1.7.0+) registers them with show_in_rest +
 * an edit auth_callback, which is what makes this persist. The active SEO
 * plugin reads its own key; the other key is harmless extra post meta.
 *
 * NOTE: the older `yoast_meta` wrapper does NOT work — Yoast never registered
 * it as a writable field, so WP returned 200 and silently dropped it. Verified
 * via --probe-meta on packing-station (2026-06-01).
 */
async function writeMeta(cfg: WpCfg, item: WpItem, metaDescription: string): Promise<void> {
    const base = normalizeUrl(cfg.url)
    const res = await fetch(`${base}/wp-json/wp/v2/${item.type}/${item.id}`, {
        method: 'POST',
        headers: { Authorization: authHeader(cfg), 'Content-Type': 'application/json' },
        body: JSON.stringify({
            meta: {
                _yoast_wpseo_metadesc: metaDescription,
                rank_math_description: metaDescription,
            },
        }),
        signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`${res.status}: ${txt.slice(0, 200)}`)
    }
    // 200 alone is not proof — unregistered meta keys are silently dropped.
    // Read back to confirm at least one key actually persisted.
    const check = await fetch(`${base}/wp-json/wp/v2/${item.type}/${item.id}?context=edit&_fields=meta`, {
        headers: { Authorization: authHeader(cfg) },
        signal: AbortSignal.timeout(30000),
    })
    if (check.ok) {
        const j = await check.json().catch(() => null) as { meta?: Record<string, unknown> } | null
        const m = j?.meta || {}
        const persisted = m._yoast_wpseo_metadesc === metaDescription || m.rank_math_description === metaDescription
        if (!persisted) {
            throw new Error('meta_not_persisted: WP accepted the write but did not store it — companion plugin v1.7.0+ (show_in_rest meta) likely not installed')
        }
    }
}

/**
 * Full batch: load WP creds → list weak posts+pages → generate → write back.
 * Never throws on per-item failure; aggregates into the result.
 */
export async function runSeoMetaBatch(
    instanceId: string,
    opts: { agentId?: string | null; businessName?: string; dryRun?: boolean; onlyIds?: number[] } = {},
): Promise<SeoMetaBatchResult> {
    const result: SeoMetaBatchResult = {
        ok: false, integrationMissing: false, detectorAvailable: false,
        authError: false,
        scanned: 0, candidates: 0, updated: [], failures: [],
    }

    const cfg = await loadWpConfig(instanceId, opts.agentId)
    if (!cfg) {
        result.integrationMissing = true
        return result
    }

    let weak: WpItem[]
    try {
        const listed = await listWeakItems(cfg)
        weak = listed.candidates
        result.scanned = listed.scanned
        result.detectorAvailable = listed.detectorAvailable
    } catch (err) {
        result.error = (err as Error).message
        return result
    }

    // Optional scope: restrict to specific post/page IDs (still must be weak).
    if (opts.onlyIds && opts.onlyIds.length) {
        const allow = new Set(opts.onlyIds)
        weak = weak.filter(it => allow.has(it.id))
    }

    result.candidates = weak.length
    if (weak.length === 0) {
        result.ok = true   // nothing to do — idempotent no-op
        return result
    }

    const toProcess = weak.slice(0, MAX_UPDATES_PER_RUN)
    const apiKey = await getApiKeyForInstance(instanceId)
    if (!apiKey) {
        result.error = 'no API key for instance'
        return result
    }
    const model = await resolveDirectModel(instanceId, 'yotzer')
    const businessName = opts.businessName || 'העסק'

    // Generate in chunks, then write each item we got a description for.
    for (let i = 0; i < toProcess.length; i += GEN_CHUNK_SIZE) {
        const chunk = toProcess.slice(i, i + GEN_CHUNK_SIZE)
        const descs = await generateChunk(apiKey, model, businessName, chunk)
        for (const item of chunk) {
            const meta = descs.get(item.id)
            if (!meta) {
                result.failures.push({ type: item.type, id: item.id, error: 'no description generated' })
                continue
            }
            try {
                // dryRun: verify list + generation + plugin-detection path
                // without performing any external WP write. Reports what WOULD
                // change so we can confirm a tenant's REST setup safely first.
                if (!opts.dryRun) await writeMeta(cfg, item, meta)
                result.updated.push({ type: item.type, id: item.id, title: item.title, link: item.link, metaDescription: meta })
            } catch (err) {
                const msg = (err as Error).message
                // 401/403 → the WP connection can't write (app password revoked,
                // user lacks edit caps, or the server strips Authorization). This
                // is a connection problem, NOT a missing SEO plugin.
                if (/^(401|403)\b/.test(msg)) result.authError = true
                result.failures.push({ type: item.type, id: item.id, error: msg })
            }
        }
    }

    result.ok = result.updated.length > 0 || result.failures.length === 0
    return result
}