/**
 * Brand Book v2 controllers — REST API surface for the new brand-foundation
 * UX (uploaded vs website-scan flow + per-key approval workflow).
 *
 * Endpoints:
 *   POST /hosting/instances/:id/brand-v2/start        — start fresh draft
 *   GET  /hosting/instances/:id/brand-v2/draft        — current draft state
 *   GET  /hosting/instances/:id/brand-v2/approved     — currently approved
 *   GET  /hosting/instances/:id/brand-v2/history      — version history
 *   PATCH /hosting/instances/:id/brand-v2/draft       — partial update (path: value)
 *   POST /hosting/instances/:id/brand-v2/upload-asset — upload binary asset (logo/etc) → VPS
 *   POST /hosting/instances/:id/brand-v2/normalize-logo — auto-generate logo variants
 *   POST /hosting/instances/:id/brand-v2/extract-colors — extract palette from image
 *   POST /hosting/instances/:id/brand-v2/submit       — submit draft for approval
 *   POST /hosting/instances/:id/brand-v2/approve      — approve submitted draft
 *   POST /hosting/instances/:id/brand-v2/discard      — discard current draft
 *   POST /hosting/instances/:id/brand-v2/start-over   — wipe + fresh draft
 *   POST /hosting/instances/:id/brand-v2/edit-approved — clone approved → new draft
 *   GET  /hosting/instances/:id/brand-v2/quality-gates — current pass/fail status
 */

import type { Context } from 'hono'
import { db } from '@/db'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'

export const startBrandV2 = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const body = await c.req.json<{ sourceFlow?: 'uploaded' | 'website_scan' | 'mixed' }>()
            .catch(() => ({} as { sourceFlow?: 'uploaded' | 'website_scan' | 'mixed' }))
        const sourceFlow = (['uploaded', 'website_scan', 'mixed'].includes(body?.sourceFlow as any)
            ? body.sourceFlow
            : 'uploaded') as any
        const { startNewDraft } = await import('@/services/brandBookV2Service')
        const r = await startNewDraft({ instanceId, sourceFlow })
        return ok(c, r)
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const getBrandV2Draft = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const { getCurrentDraft } = await import('@/services/brandBookV2Service')
        const r = await getCurrentDraft(instanceId)
        return ok(c, r)
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const getBrandV2Approved = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const { getApprovedBook } = await import('@/services/brandBookV2Service')
        const book = await getApprovedBook(instanceId)
        return ok(c, { book })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const getBrandV2History = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const { getHistory } = await import('@/services/brandBookV2Service')
        const history = await getHistory(instanceId)
        return ok(c, { history })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const patchBrandV2Draft = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const body = await c.req.json<{ updates: Record<string, any> }>()
        if (!body?.updates) return fail(c, 'updates required', 400)
        const { updateDraftKeys } = await import('@/services/brandBookV2Service')
        const r = await updateDraftKeys(instanceId, body.updates)
        return ok(c, r)
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const uploadBrandAsset = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const body = await c.req.json<{
            category: string
            subPath?: string
            filename: string
            contentBase64: string
            contentType: string
        }>()
        if (!body.contentBase64 || !body.filename || !body.category) {
            return fail(c, 'category, filename, contentBase64 required', 400)
        }
        const { uploadAssetToVps } = await import('@/services/brandAssetStorage')
        const r = await uploadAssetToVps({
            instanceId,
            category: body.category as any,
            subPath: body.subPath,
            filename: body.filename,
            contentBase64: body.contentBase64,
            contentType: body.contentType,
        })
        return ok(c, r, 'Asset uploaded')
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const normalizeBrandLogo = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const body = await c.req.json<{ contentBase64: string; contentType: string }>()
        if (!body.contentBase64) return fail(c, 'contentBase64 required', 400)
        const { db } = await import('@/db')
        const { instances } = await import('@/db/schema')
        const { eq } = await import('drizzle-orm')
        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        const falApiKey = (inst as any)?.falApiKey || undefined
        const { normalizeLogo } = await import('@/services/brandImageNormalizer')
        const variants = await normalizeLogo({
            instanceId,
            inputBase64: body.contentBase64,
            contentType: body.contentType,
            falApiKey,
        })
        // Persist the normalized logos into the draft
        const { updateDraftKeys, getCurrentDraft, startNewDraft } = await import('@/services/brandBookV2Service')
        if (!await getCurrentDraft(instanceId)) {
            await startNewDraft({ instanceId, sourceFlow: 'uploaded' })
        }
        await updateDraftKeys(instanceId, {
            'visual.logo': {
                ...variants,
                confidence: 'high',
                source: 'uploaded',
                updatedAt: new Date().toISOString(),
            },
        })
        return ok(c, { variants }, 'Logo normalized')
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const extractColorsFromImage = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const body = await c.req.json<{ contentBase64: string; count?: number }>()
        if (!body.contentBase64) return fail(c, 'contentBase64 required', 400)
        const { extractDominantColors } = await import('@/services/brandImageNormalizer')
        const colors = await extractDominantColors(body.contentBase64, body.count || 5)
        return ok(c, { colors })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const submitBrandV2 = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const { submitForApproval } = await import('@/services/brandBookV2Service')
        const r = await submitForApproval(instanceId)
        return ok(c, r)
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const approveBrandV2 = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)
        const body = await c.req.json<{ skipGates?: boolean }>().catch(() => ({} as { skipGates?: boolean }))
        const { approveDraft } = await import('@/services/brandBookV2Service')
        const r = await approveDraft({ instanceId, userId: userId || undefined, skipGates: !!body?.skipGates })
        if (!r.ok) return fail(c, r.reason || 'approval failed', 400)
        return ok(c, r, 'Brand book approved')
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const discardBrandV2Draft = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const { discardDraft } = await import('@/services/brandBookV2Service')
        const r = await discardDraft(instanceId)
        return ok(c, r, 'Draft discarded')
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const startOverBrandV2 = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const body = await c.req.json<{ sourceFlow?: 'uploaded' | 'website_scan' | 'mixed' }>()
            .catch(() => ({} as { sourceFlow?: 'uploaded' | 'website_scan' | 'mixed' }))
        const sourceFlow = (['uploaded', 'website_scan', 'mixed'].includes(body?.sourceFlow as any)
            ? body.sourceFlow
            : 'uploaded') as any
        const { startOverFresh } = await import('@/services/brandBookV2Service')
        const r = await startOverFresh({ instanceId, sourceFlow })
        return ok(c, r, 'Fresh start')
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const editApprovedBrandV2 = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const { editApproved } = await import('@/services/brandBookV2Service')
        const r = await editApproved(instanceId)
        return ok(c, r, 'Editing approved as new draft')
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

// Sprint 3 — Website scan
export const scanWebsiteForBrandV2 = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const body = await c.req.json<{ websiteUrl?: string }>().catch(() => ({} as { websiteUrl?: string }))

        const { db } = await import('@/db')
        const { instances } = await import('@/db/schema')
        const { eq } = await import('drizzle-orm')
        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        const rd: any = inst?.researchData || {}

        // Resolve URL: explicit > paid_profile.businessUrl > research.answers.websiteUrl
        let websiteUrl = (body.websiteUrl || '').trim()
        if (!websiteUrl) websiteUrl = rd.answers?.websiteUrl || ''

        // Graceful pre-checks — return structured 200 result with `requiresIntegration`
        // instead of throwing 500. UI handles by offering inline connect or
        // fallback to uploaded flow.
        const firecrawlKey = (inst as any)?.firecrawlKey
        if (!firecrawlKey) {
            return ok(c, {
                ok: false,
                requiresIntegration: 'firecrawl',
                fallbackFlow: 'uploaded',
                connectPath: 'integrations',
                message: 'נדרש Firecrawl API key לסריקת אתר. אפשר לחבר עכשיו או להמשיך ידני.',
            }, 'Firecrawl integration required')
        }
        if (!websiteUrl) {
            return ok(c, {
                ok: false,
                requiresField: 'websiteUrl',
                fallbackFlow: 'uploaded',
                message: 'לא נמצא URL — מלאו ב-פרופיל עסקי או המשיכו ידני.',
            }, 'Website URL missing')
        }

        // Ensure draft exists
        const { getCurrentDraft, startNewDraft, updateDraftKeys } = await import('@/services/brandBookV2Service')
        if (!await getCurrentDraft(instanceId)) {
            await startNewDraft({ instanceId, sourceFlow: 'website_scan' })
        }
        const { scanWebsiteForBrand } = await import('@/services/brandWebsiteScanner')
        const result = await scanWebsiteForBrand({ instanceId, websiteUrl })

        // Merge extracted keys into draft
        const updates: Record<string, any> = {}
        if (result.book.identity) for (const [k, v] of Object.entries(result.book.identity)) updates[`identity.${k}`] = v
        if (result.book.visual) for (const [k, v] of Object.entries(result.book.visual)) updates[`visual.${k}`] = v
        if (result.book.voice) for (const [k, v] of Object.entries(result.book.voice)) updates[`voice.${k}`] = v
        if (result.book.audience) for (const [k, v] of Object.entries(result.book.audience)) updates[`audience.${k}`] = v
        if (Object.keys(updates).length > 0) await updateDraftKeys(instanceId, updates)

        // Stamp DB row with the URL + timestamp so the wizard can detect "scan
        // ran" vs "never ran" (drives the scan_done banner + suppresses
        // "scan_ready" CTAs for already-scraped drafts).
        try {
            const { brandBooks } = await import('@/db/schema')
            const { and: andOp, eq: eqOp } = await import('drizzle-orm')
            await db.update(brandBooks)
                .set({ sourceUrl: websiteUrl, sourceScrapedAt: new Date() })
                .where(andOp(eqOp(brandBooks.instanceId, instanceId), eqOp(brandBooks.status, 'draft')))
        } catch (e) {
            console.warn('[scanWebsiteForBrandV2] source_url/source_scraped_at write failed:', (e as Error).message)
        }

        return ok(c, result, `Scanned ${result.pagesScanned} pages — extracted ${result.extractedKeys.length} keys`)
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

// Sprint 4 — AI generation per missing key
export const generateBrandLogoCandidates = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const { db } = await import('@/db')
        const { instances } = await import('@/db/schema')
        const { eq } = await import('drizzle-orm')
        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        const falApiKey = (inst as any)?.falApiKey
        if (!falApiKey) return fail(c, 'fal.ai key required — connect via creative integrations', 400)

        const body = await c.req.json<any>().catch(() => ({}))
        const { generateLogoCandidates } = await import('@/services/brandAIGenerator')
        const r = await generateLogoCandidates({
            instanceId,
            falApiKey,
            businessName: body.businessName || 'Business',
            tagline: body.tagline,
            industry: body.industry,
            voiceTone: body.voiceTone,
            archetype: body.archetype,
            seedColors: body.seedColors,
            notes: body.notes,
        })
        return ok(c, r, `Generated ${r.candidates.length} logo candidates`)
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const adoptGeneratedBrandLogo = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const body = await c.req.json<{ candidateUrl: string }>()
        if (!body.candidateUrl) return fail(c, 'candidateUrl required', 400)

        const { db } = await import('@/db')
        const { instances } = await import('@/db/schema')
        const { eq } = await import('drizzle-orm')
        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        const falApiKey = (inst as any)?.falApiKey

        const { adoptGeneratedLogo } = await import('@/services/brandAIGenerator')
        const logo = await adoptGeneratedLogo({ instanceId, falApiKey, candidateUrl: body.candidateUrl })

        const { updateDraftKeys, getCurrentDraft, startNewDraft } = await import('@/services/brandBookV2Service')
        if (!await getCurrentDraft(instanceId)) await startNewDraft({ instanceId, sourceFlow: 'mixed' })
        await updateDraftKeys(instanceId, { 'visual.logo': logo })
        return ok(c, { logo }, 'Logo adopted into draft')
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const generateBrandImagery = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const { db } = await import('@/db')
        const { instances } = await import('@/db/schema')
        const { eq } = await import('drizzle-orm')
        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        const falApiKey = (inst as any)?.falApiKey
        if (!falApiKey) return fail(c, 'fal.ai key required', 400)

        const body = await c.req.json<any>().catch(() => ({}))
        const { generateImageryReferences } = await import('@/services/brandAIGenerator')
        const r = await generateImageryReferences({
            instanceId,
            falApiKey,
            businessName: body.businessName || 'Business',
            industry: body.industry,
            style: body.style,
            archetype: body.archetype,
            seedColors: body.seedColors,
            count: body.count || 5,
        })
        // Stash imagery URLs into draft
        const { updateDraftKeys, getCurrentDraft, startNewDraft } = await import('@/services/brandBookV2Service')
        if (!await getCurrentDraft(instanceId)) await startNewDraft({ instanceId, sourceFlow: 'mixed' })
        await updateDraftKeys(instanceId, {
            'visual.imagery': {
                style: body.style || 'warm lifestyle photography',
                referenceUrls: r.images.map(i => i.url),
                confidence: 'medium',
                source: 'generated',
                generatedBy: 'fal-ai/flux-2-pro',
                updatedAt: new Date().toISOString(),
            },
        })
        return ok(c, r, `Generated ${r.images.length} imagery references`)
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const generateBrandVoiceFor = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const { db } = await import('@/db')
        const { instances } = await import('@/db/schema')
        const { eq } = await import('drizzle-orm')
        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        const apiKey = (inst as any)?.aiProviderKey || process.env.ANTHROPIC_API_KEY
        if (!apiKey) return fail(c, 'Anthropic API key required', 400)

        const body = await c.req.json<any>().catch(() => ({}))
        const { generateBrandVoice } = await import('@/services/brandAIGenerator')
        const r = await generateBrandVoice({
            apiKey,
            businessName: body.businessName || 'Business',
            industry: body.industry,
            websiteCorpus: body.websiteCorpus,
            targetMarket: body.targetMarket,
            language: body.language || 'he',
        })

        const meta = { confidence: 'medium', source: 'generated', generatedBy: 'claude-sonnet-4-6', updatedAt: new Date().toISOString() }
        const { updateDraftKeys } = await import('@/services/brandBookV2Service')
        await updateDraftKeys(instanceId, {
            'identity.tagline': { ...r.tagline, ...meta },
            'identity.mission': { ...r.mission, ...meta },
            'identity.positioningStatement': { ...r.positioning, ...meta },
            'identity.manifesto': { ...r.manifesto, ...meta },
            'voice.voice': {
                archetype: r.archetype,
                toneSummary: r.toneSummary,
                principles: r.principles,
                do: r.do,
                dont: r.dont,
                vocabulary: r.vocabulary,
                ...meta,
            },
            'voice.messaging': {
                elevatorPitch: r.elevatorPitch,
                boilerplate: r.boilerplate,
                ...meta,
            },
        })
        return ok(c, r, 'Voice + messaging generated')
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const generateBrandPersonasFor = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const { db } = await import('@/db')
        const { instances } = await import('@/db/schema')
        const { eq } = await import('drizzle-orm')
        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        const apiKey = (inst as any)?.aiProviderKey || process.env.ANTHROPIC_API_KEY
        if (!apiKey) return fail(c, 'Anthropic API key required', 400)

        const body = await c.req.json<any>().catch(() => ({}))
        const { generateBrandPersonas } = await import('@/services/brandAIGenerator')
        const r = await generateBrandPersonas({
            apiKey,
            businessName: body.businessName || 'Business',
            industry: body.industry,
            targetMarket: body.targetMarket,
            websiteCorpus: body.websiteCorpus,
            count: body.count || 3,
        })

        const { updateDraftKeys } = await import('@/services/brandBookV2Service')
        await updateDraftKeys(instanceId, {
            'audience.personas': {
                items: r.personas,
                confidence: 'medium',
                source: 'generated',
                generatedBy: 'claude-sonnet-4-6',
                updatedAt: new Date().toISOString(),
            },
        })
        return ok(c, r, `Generated ${r.personas.length} personas`)
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const generateBrandColorPaletteFor = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const { db } = await import('@/db')
        const { instances } = await import('@/db/schema')
        const { eq } = await import('drizzle-orm')
        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        const apiKey = (inst as any)?.aiProviderKey || process.env.ANTHROPIC_API_KEY
        if (!apiKey) return fail(c, 'Anthropic API key required', 400)

        const body = await c.req.json<any>().catch(() => ({}))
        const { generateColorPalette } = await import('@/services/brandAIGenerator')
        const palette = await generateColorPalette({
            apiKey,
            businessName: body.businessName || 'Business',
            industry: body.industry,
            archetype: body.archetype,
            voiceTone: body.voiceTone,
            seedColor: body.seedColor,
        })
        const { updateDraftKeys } = await import('@/services/brandBookV2Service')
        await updateDraftKeys(instanceId, { 'visual.colors': palette })
        return ok(c, { palette }, 'Color palette generated')
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

// Sprint 6 — Export (with research + AI narrative enhancement + cache)
// Query params:
//   ?ai=false  — skip Sonnet narrative (fast, ~1s instead of 30-45s)
//   ?fresh=1   — force regenerate (bypass cache)
const _exportCache = new Map<string, { ts: number; html: string }>()
const CACHE_TTL_MS = 30 * 60 * 1000      // 30 min — narrative doesn't change often

export const exportBrandV2Html = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const { getApprovedBook, getCurrentDraft } = await import('@/services/brandBookV2Service')
        const book = (await getApprovedBook(instanceId)) || (await getCurrentDraft(instanceId))?.book
        if (!book) return fail(c, 'No brand book found', 404)

        const skipAI = c.req.query('ai') === 'false'
        const fresh = c.req.query('fresh') === '1'
        const cacheKey = `${instanceId}:v${book.version}:${book.status}:${skipAI ? 'noai' : 'ai'}`

        // Cache hit
        if (!fresh) {
            const cached = _exportCache.get(cacheKey)
            if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
                c.header('Content-Type', 'text/html; charset=utf-8')
                c.header('Content-Disposition', `inline; filename="brand-book-${instanceId}.html"`)
                c.header('X-Cache', 'HIT')
                return c.body(cached.html)
            }
        }

        // Pull research + API key for AI narrative enhancement
        const { db } = await import('@/db')
        const { instances } = await import('@/db/schema')
        const { eq } = await import('drizzle-orm')
        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        const researchData = (inst as any)?.researchData || {}
        const apiKey = skipAI ? undefined : ((inst as any)?.aiProviderKey || process.env.ANTHROPIC_API_KEY)

        const { exportBrandBookAsHtml } = await import('@/services/brandBookExporter')
        const html = await exportBrandBookAsHtml({ book, researchData, apiKey })

        _exportCache.set(cacheKey, { ts: Date.now(), html })
        if (_exportCache.size > 50) {
            // Evict oldest
            const oldest = [..._exportCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0]
            if (oldest) _exportCache.delete(oldest[0])
        }

        c.header('Content-Type', 'text/html; charset=utf-8')
        c.header('Content-Disposition', `inline; filename="brand-book-${instanceId}.html"`)
        c.header('X-Cache', 'MISS')
        return c.body(html)
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const exportBrandV2AssetManifest = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const { getApprovedBook, getCurrentDraft } = await import('@/services/brandBookV2Service')
        const book = (await getApprovedBook(instanceId)) || (await getCurrentDraft(instanceId))?.book
        if (!book) return fail(c, 'No brand book found', 404)
        const { getBrandAssetManifest } = await import('@/services/brandBookExporter')
        const manifest = getBrandAssetManifest(book)
        return ok(c, manifest)
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const getBrandV2QualityGates = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const { getCurrentDraft } = await import('@/services/brandBookV2Service')
        const draft = await getCurrentDraft(instanceId)
        if (!draft) return fail(c, 'No draft', 404)
        const { evaluateQualityGates } = await import('../../../../../packages/shared/src/brand/brandBookV2')
        const gates = evaluateQualityGates(draft.book)
        return ok(c, gates)
    } catch (err) { return fail(c, (err as Error).message, 500) }
}