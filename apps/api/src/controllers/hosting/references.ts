/**
 * Creative References Controller (Phase B3)
 *
 * Endpoints:
 *   POST .../creative/references/mine      — trigger mining from competitors
 *                                            Body: { pageIds?[], pageNames?[], searchTerms? }
 *   GET  .../creative/references           — list all references (with DNA)
 *   POST .../creative/references/decompose — DNA-tag pending references (batch)
 *   DELETE .../creative/references/:id     — drop a reference
 *
 * Reference mining pipeline:
 *   1. Get user's competitors from research stage 2 (or provided manually)
 *   2. If names → resolve to Meta Page IDs
 *   3. Fetch their active ads via Meta Ad Library API
 *   4. Upsert into creative_references (dedup by ad_archive_id)
 *   5. Score by signalScore = daysActive * variationCount
 *   6. For top N (default 10): Claude Vision decompose → store DNA
 *
 * Result: top-10 competitor winners, DNA-tagged, ready to inject as
 * few-shot in Yotzer Gate 1.
 */

import type { Context } from 'hono'
import { randomBytes } from 'crypto'
import { readFileSync } from 'fs'
import { eq, and, desc } from 'drizzle-orm'
import { Client } from 'ssh2'

import { db } from '@/db'
import { instances, creativeReferences } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'
import { fetchAdLibraryAds, resolvePageIds, rankAdsByWinnerSignal, type AdLibraryAd } from '@/services/metaAdLibrary'
import { decomposeCreativeBatch } from '@/services/creativeDNA'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'
let sshKeyCache: Buffer | null = null
function getSSHKey(): Buffer {
    if (!sshKeyCache) sshKeyCache = readFileSync(SSH_KEY_PATH)
    return sshKeyCache
}

function sshExec(ip: string, command: string, password?: string, timeoutMs = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        let output = ''
        const timer = setTimeout(() => { conn.end(); reject(new Error('SSH timeout')) }, timeoutMs)
        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { clearTimeout(timer); conn.end(); return reject(err) }
                stream.on('data', (d: Buffer) => { output += d.toString() })
                stream.stderr.on('data', (d: Buffer) => { output += d.toString() })
                stream.on('close', () => { clearTimeout(timer); conn.end(); resolve(output.trim()) })
            })
        }).on('error', (err) => { clearTimeout(timer); reject(err) })
        const opts: Record<string, unknown> = { host: ip, port: 22, username: 'root', readyTimeout: 10000 }
        if (password) opts.password = password
        try { opts.privateKey = getSSHKey() } catch { if (!password) return reject(new Error('No SSH key or password')) }
        conn.connect(opts)
    })
}

async function distributeReferencesToTenant(instanceId: string): Promise<void> {
    const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!instance?.ip) return

    // Load top-decomposed references (must have DNA for agent to use well)
    const top = await db.select().from(creativeReferences)
        .where(and(
            eq(creativeReferences.instanceId, instanceId),
            eq(creativeReferences.isActive, true),
        ))
        .orderBy(desc(creativeReferences.signalScore))
        .limit(15)

    const payload = {
        generatedAt: new Date().toISOString(),
        totalCount: top.length,
        references: top.map(r => ({
            id: r.id,
            source: r.source,
            competitorName: r.competitorName,
            daysActive: r.daysActive,
            variationCount: r.variationCount,
            signalScore: parseFloat(r.signalScore || '0'),
            headline: r.headline,
            bodyText: r.bodyText,
            ctaText: r.ctaText,
            dna: r.dna,
        })),
    }

    const json = JSON.stringify(payload, null, 2)
    const b64 = Buffer.from(json, 'utf-8').toString('base64')
    await sshExec(
        instance.ip,
        `mkdir -p /home/openclaw/.openclaw/workspace && ` +
        `echo '${b64}' | base64 -d > /home/openclaw/.openclaw/workspace/CREATIVE_REFERENCES.json && ` +
        `chown openclaw:openclaw /home/openclaw/.openclaw/workspace/CREATIVE_REFERENCES.json`,
        instance.rootPassword || undefined,
        30000,
    ).catch(err => {
        console.error(`[references] distribute failed for ${instanceId}:`, err)
    })
}

const genId = () => 'ref_' + randomBytes(6).toString('hex')

// ═══════════════════════════════════════════════════════════════════════════
// POST .../creative/references/mine
// Body: { pageIds?: string[], pageNames?: string[], searchTerms?: string,
//         autoDecompose?: boolean (default true), topN?: number }
// ═══════════════════════════════════════════════════════════════════════════
export const mineReferences = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const mt = (instance as any).metaTokens
        const metaToken = mt?.userAccessToken || mt?.accessToken
        if (!metaToken) {
            return fail(c, 'Meta access token נדרש — חבר Meta (integrations)', 400)
        }

        const anthropicKey = (instance as any).aiProviderKey
        if (!anthropicKey) return fail(c, 'Anthropic key נדרש ל-DNA decompose', 400)

        const body = await c.req.json<{
            pageIds?: string[]
            pageNames?: string[]
            searchTerms?: string
            autoDecompose?: boolean
            topN?: number
        }>()

        const topN = Math.min(body.topN || 10, 25)
        const autoDecompose = body.autoDecompose !== false

        // Step 1: resolve page names → IDs if needed
        let pageIds: string[] = body.pageIds || []
        const resolved: Array<{ name: string; pageId: string | null; resolvedName?: string }> = []
        if (body.pageNames && body.pageNames.length > 0) {
            const lookups = await resolvePageIds(metaToken, body.pageNames)
            resolved.push(...lookups)
            pageIds = [...pageIds, ...lookups.map(l => l.pageId).filter((id): id is string => !!id)]
        }

        if (pageIds.length === 0 && !body.searchTerms) {
            return fail(c, 'נדרש pageIds/pageNames או searchTerms', 400)
        }

        // Step 2: fetch ads from Meta Ad Library
        console.log(`[references/mine] ${instanceId} fetching ads for ${pageIds.length} pages (searchTerms=${body.searchTerms || '—'})`)
        const { ads, error: fetchError } = await fetchAdLibraryAds(metaToken, {
            pageIds: pageIds.length > 0 ? pageIds : undefined,
            searchTerms: body.searchTerms,
            country: 'IL',
            activeOnly: true,
            maxTotal: 100,
        })

        if (ads.length === 0) {
            return ok(c, {
                fetched: 0,
                upserted: 0,
                decomposed: 0,
                resolvedPages: resolved,
                error: fetchError || 'לא נמצאו מודעות פעילות',
            }, 'No ads found.')
        }

        // Step 3: upsert into DB
        const upserted: string[] = []
        const topRanked = rankAdsByWinnerSignal(ads, topN)
        for (const ad of topRanked) {
            const id = await upsertReference(instanceId, ad)
            if (id) upserted.push(id)
        }

        // Step 4: decompose DNA for new/un-decomposed refs
        let decomposed = 0
        if (autoDecompose && upserted.length > 0) {
            decomposed = await decomposePending(instanceId, anthropicKey, upserted)
        }

        // Step 5: distribute to tenant VPS so yotzer can read
        await distributeReferencesToTenant(instanceId)

        return ok(c, {
            fetched: ads.length,
            upserted: upserted.length,
            decomposed,
            resolvedPages: resolved,
            topRefIds: upserted,
        }, 'Mined.')
    } catch (err) {
        console.error('mineReferences error:', err)
        return fail(c, err instanceof Error ? err.message : 'Mining failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET .../creative/references
// Lists all references, newest first. Filter by ?active=true.
// ═══════════════════════════════════════════════════════════════════════════
export const listReferences = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const activeOnly = c.req.query('active') === 'true'
        const limit = Math.min(parseInt(c.req.query('limit') || '100', 10), 300)

        const conds = [eq(creativeReferences.instanceId, instanceId)]
        if (activeOnly) conds.push(eq(creativeReferences.isActive, true))

        const rows = await db.select().from(creativeReferences)
            .where(and(...conds))
            .orderBy(desc(creativeReferences.signalScore))
            .limit(limit)

        return ok(c, { references: rows, count: rows.length })
    } catch (err) {
        console.error('listReferences error:', err)
        return fail(c, 'List failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST .../creative/references/decompose
// Runs Claude Vision DNA decompose for references missing DNA.
// Body: { refIds?: string[] (specific), limit?: number (default 10) }
// ═══════════════════════════════════════════════════════════════════════════
export const decomposeReferences = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const anthropicKey = (instance as any).aiProviderKey
        if (!anthropicKey) return fail(c, 'Anthropic key נדרש', 400)

        const body = await c.req.json<{ refIds?: string[]; limit?: number }>().catch(() => ({} as { refIds?: string[]; limit?: number }))
        const limit = Math.min(body.limit || 10, 25)
        const count = await decomposePending(instanceId, anthropicKey, body.refIds, limit)

        // Re-distribute if any DNA was added — agent should see updated tags
        if (count > 0) await distributeReferencesToTenant(instanceId)

        return ok(c, { decomposed: count }, `${count} references decomposed.`)
    } catch (err) {
        console.error('decomposeReferences error:', err)
        return fail(c, 'Decompose failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// DELETE .../creative/references/:refId
// ═══════════════════════════════════════════════════════════════════════════
export const deleteReference = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const refId = c.req.param('refId')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        await db.delete(creativeReferences)
            .where(and(eq(creativeReferences.id, refId), eq(creativeReferences.instanceId, instanceId)))

        return ok(c, null, 'Deleted.')
    } catch (err) {
        console.error('deleteReference error:', err)
        return fail(c, 'Delete failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

async function upsertReference(instanceId: string, ad: AdLibraryAd): Promise<string | null> {
    try {
        // Check if already exists (instance + source + source_id uniqueness)
        const [existing] = await db.select().from(creativeReferences)
            .where(and(
                eq(creativeReferences.instanceId, instanceId),
                eq(creativeReferences.source, 'meta_ad_library'),
                eq(creativeReferences.sourceId, ad.adArchiveId),
            ))
            .limit(1)

        const signalScore = Math.round((ad.daysActive || 1) * Math.max(ad._variationCount, 1) * 100) / 100

        if (existing) {
            // Update signals — days active may have grown, variation count may have changed
            await db.update(creativeReferences).set({
                daysActive: ad.daysActive,
                variationCount: ad._variationCount,
                lastSeenAt: ad.deliveryStop ? new Date(ad.deliveryStop) : new Date(),
                spendRangeMin: ad.spendRangeMin,
                spendRangeMax: ad.spendRangeMax,
                impressionsMin: ad.impressionsRangeMin,
                impressionsMax: ad.impressionsRangeMax,
                signalScore: String(signalScore),
                isActive: !ad.deliveryStop,
                lastCheckedAt: new Date(),
                updatedAt: new Date(),
            }).where(eq(creativeReferences.id, existing.id))
            return existing.id
        }

        // Insert new
        const id = genId()
        await db.insert(creativeReferences).values({
            id,
            instanceId,
            source: 'meta_ad_library',
            sourceId: ad.adArchiveId,
            sourceUrl: ad._adLibraryUrl,
            competitorName: ad.pageName,
            country: 'IL',
            firstSeenAt: ad.deliveryStart ? new Date(ad.deliveryStart) : null,
            lastSeenAt: ad.deliveryStop ? new Date(ad.deliveryStop) : new Date(),
            daysActive: ad.daysActive,
            variationCount: ad._variationCount,
            spendRangeMin: ad.spendRangeMin,
            spendRangeMax: ad.spendRangeMax,
            impressionsMin: ad.impressionsRangeMin,
            impressionsMax: ad.impressionsRangeMax,
            headline: ad.adCreativeLinkTitles[0] || null,
            bodyText: ad.adCreativeBodies[0] || null,
            ctaText: ad.adCreativeLinkCaptions[0] || null,
            imageUrl: ad.imageUrls[0] || null,
            videoThumbUrl: ad.videoUrls[0] || null,
            platforms: ad.platforms,
            signalScore: String(signalScore),
            isActive: !ad.deliveryStop,
            lastCheckedAt: new Date(),
        })
        return id
    } catch (err) {
        console.error('upsertReference error for', ad.adArchiveId, err)
        return null
    }
}

async function decomposePending(
    instanceId: string,
    anthropicKey: string,
    specificRefIds?: string[],
    limit = 10,
): Promise<number> {
    // Find refs without DNA
    let rows: Array<typeof creativeReferences.$inferSelect>
    if (specificRefIds && specificRefIds.length > 0) {
        rows = []
        for (const id of specificRefIds) {
            const [r] = await db.select().from(creativeReferences)
                .where(and(eq(creativeReferences.id, id), eq(creativeReferences.instanceId, instanceId)))
            if (r && !r.dna) rows.push(r)
        }
    } else {
        rows = await db.select().from(creativeReferences)
            .where(and(
                eq(creativeReferences.instanceId, instanceId),
                eq(creativeReferences.isActive, true),
            ))
            .orderBy(desc(creativeReferences.signalScore))
            .limit(limit * 2)   // fetch extra, filter client-side for null DNA
        rows = rows.filter(r => !r.dna).slice(0, limit)
    }

    if (rows.length === 0) return 0

    const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
    const businessContext = ((instance?.researchData as any)?.answers?.businessDescription || '').substring(0, 300)

    const items = rows.map(r => ({
        id: r.id,
        imageUrl: r.imageUrl || undefined,
        videoThumbnailUrl: r.videoThumbUrl || undefined,
        copyText: [r.headline, r.bodyText, r.ctaText].filter(Boolean).join('\n\n'),
    }))

    const results = await decomposeCreativeBatch({
        anthropicKey,
        items,
        businessContext,
        concurrency: 3,
    })

    let count = 0
    for (const r of results) {
        if (!r.dna) continue
        await db.update(creativeReferences).set({
            dna: r.dna,
            dnaComputedAt: new Date(),
            updatedAt: new Date(),
        }).where(eq(creativeReferences.id, r.id))
        count++
    }
    return count
}