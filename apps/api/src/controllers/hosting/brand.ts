/**
 * Brand Book Controller — orchestrates the Brand Foundation flow.
 *
 * Pipeline:
 *   POST .../brand/extract            → scrape URL + return raw signals
 *   POST .../brand/analyze-logo       → Claude Vision on logo URL
 *   POST .../brand/draft              → LLM compose full brand book draft
 *   POST .../brand/approve            → mark brand book approved, distribute to tenant VPS
 *   GET  .../brand                     → current approved brand book (or latest draft)
 *   GET  .../brand/versions            → version history
 *   PATCH .../brand/:version          → user edits draft fields
 *   DELETE .../brand/:version         → archive a draft (rare)
 *
 * Distribution: on approve, writes /home/openclaw/.openclaw/workspace/BRAND_BOOK.json
 * to tenant VPS — read by mekhayev / yotzer / ayat via their file tools.
 */

import type { Context } from 'hono'
import { randomBytes } from 'crypto'
import { eq, and, desc } from 'drizzle-orm'
import { Client } from 'ssh2'
import { readFileSync } from 'fs'

import { db } from '@/db'
import { instances, brandBooks } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'
import { extractBrandFromUrl } from '@/services/brandExtract'
import { analyzeLogo } from '@/services/logoAnalyze'
import {
    composeBrandBook,
    type UserBrandInputs,
    type ResearchSummary,
} from '@/services/brandBookCompose'

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

const genId = () => 'bb_' + randomBytes(6).toString('hex')

// ═══════════════════════════════════════════════════════════════════════════
// POST /hosting/instances/:id/brand/extract
// Body: { url: string }
// Returns: ExtractedBrandSignals
// ═══════════════════════════════════════════════════════════════════════════
export const extractBrand = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{ url: string }>()
        if (!body.url) return fail(c, 'url required', 400)

        console.log(`[brand/extract] ${instanceId} scraping ${body.url}`)
        const signals = await extractBrandFromUrl(body.url)

        if (signals.httpStatus === 0 || signals.httpStatus >= 400) {
            return fail(c, `לא ניתן לגשת לאתר (HTTP ${signals.httpStatus || 'network error'})`, 400)
        }

        return ok(c, { signals }, 'Extracted.')
    } catch (err) {
        console.error('extractBrand error:', err)
        return fail(c, 'Extraction failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /hosting/instances/:id/brand/analyze-logo
// Body: { logoUrl: string }
// Returns: LogoAnalysisResult
// Uses instance.anthropicKey (BYOK)
// ═══════════════════════════════════════════════════════════════════════════
export const analyzeLogoEndpoint = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const key = (instance as any).aiProviderKey || process.env.ANTHROPIC_API_KEY
        if (!key) return fail(c, 'Anthropic API key not configured (needed for logo Vision analysis)', 400)

        const body = await c.req.json<{ logoUrl: string }>()
        if (!body.logoUrl) return fail(c, 'logoUrl required', 400)

        console.log(`[brand/analyze-logo] ${instanceId} analyzing ${body.logoUrl.substring(0, 100)}`)
        const analysis = await analyzeLogo(body.logoUrl, key)

        return ok(c, { analysis }, analysis.ok ? 'Analyzed.' : (analysis.error || 'Analysis failed'))
    } catch (err) {
        console.error('analyzeLogoEndpoint error:', err)
        return fail(c, 'Logo analysis failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /hosting/instances/:id/brand/draft
// Body: {
//   scraped?: ExtractedBrandSignals,
//   logoAnalysis?: LogoAnalysis,
//   userInputs?: UserBrandInputs
// }
// Returns: { draft, gaps, rationale, confidence, version, brandBookId }
// ═══════════════════════════════════════════════════════════════════════════
export const draftBrandBook = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const key = (instance as any).aiProviderKey || process.env.ANTHROPIC_API_KEY
        if (!key) return fail(c, 'Anthropic API key not configured', 400)

        const body = await c.req.json<{
            scraped?: any
            logoAnalysis?: any
            userInputs?: UserBrandInputs
        }>()

        // Derive research summary from instance.researchData (stages 1-5)
        const research = buildResearchSummary(instance)

        console.log(`[brand/draft] ${instanceId} composing brand book`)
        const composed = await composeBrandBook({
            scraped: body.scraped || null,
            logoAnalysis: body.logoAnalysis || null,
            research,
            userInputs: body.userInputs || null,
            anthropicKey: key,
        })

        // Determine next version number
        const existing = await db.select({ version: brandBooks.version })
            .from(brandBooks)
            .where(eq(brandBooks.instanceId, instanceId))
            .orderBy(desc(brandBooks.version))
            .limit(1)
        const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1

        // Persist as draft
        const brandBookId = genId()
        const draft = composed.draft
        await db.insert(brandBooks).values({
            id: brandBookId,
            instanceId,
            version: nextVersion,
            status: 'pending_approval',
            source: inferSource(body),
            businessName: draft.identity.businessName,
            legalName: draft.identity.legalName,
            taglineHe: draft.identity.taglineHe,
            taglineEn: draft.identity.taglineEn,
            missionHe: draft.identity.missionHe,
            missionEn: draft.identity.missionEn,
            manifestoHe: draft.identity.manifestoHe,
            positioningLine: draft.identity.positioningLine,
            logo: draft.logo,
            colors: draft.colors,
            typography: draft.typography,
            imagery: draft.imagery,
            voice: draft.voice,
            components: draft.components,
            compliance: draft.compliance,
            principles: draft.principles,
            gaps: composed.gaps,
            sourceUrl: body.scraped?.url || null,
            sourceScrapedAt: body.scraped?.fetchedAt ? new Date(body.scraped.fetchedAt) : null,
            sourceRaw: body.scraped || null,
        })

        return ok(c, {
            brandBookId,
            version: nextVersion,
            draft: composed.draft,
            gaps: composed.gaps,
            rationale: composed.rationale,
            confidence: composed.confidence,
            sources: composed.sources,
        }, 'Brand book drafted.')
    } catch (err) {
        console.error('draftBrandBook error:', err)
        return fail(c, 'Compose failed: ' + (err instanceof Error ? err.message : String(err)), 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /hosting/instances/:id/brand/approve
// Body: { brandBookId: string, edits?: Partial<BrandBookDraft> }
// - Applies user edits to draft
// - Marks as approved
// - Archives previous approved version
// - Writes BRAND_BOOK.json to tenant VPS workspace
// ═══════════════════════════════════════════════════════════════════════════
export const approveBrandBook = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{ brandBookId: string; edits?: any }>()
        if (!body.brandBookId) return fail(c, 'brandBookId required', 400)

        // Fetch the draft
        const [draft] = await db.select().from(brandBooks)
            .where(and(eq(brandBooks.id, body.brandBookId), eq(brandBooks.instanceId, instanceId)))
        if (!draft) return fail(c, 'Brand book draft not found', 404)

        if (draft.status === 'approved') return fail(c, 'Already approved', 400)

        // Apply edits (if any) — only to known jsonb fields + identity text fields
        const patch: Record<string, unknown> = {
            status: 'approved',
            approvedAt: new Date(),
            approvedBy: userId,
            updatedAt: new Date(),
        }
        if (body.edits) {
            const e = body.edits
            if (e.identity) {
                if (e.identity.businessName !== undefined) patch.businessName = e.identity.businessName
                if (e.identity.legalName !== undefined)    patch.legalName = e.identity.legalName
                if (e.identity.taglineHe !== undefined)    patch.taglineHe = e.identity.taglineHe
                if (e.identity.taglineEn !== undefined)    patch.taglineEn = e.identity.taglineEn
                if (e.identity.missionHe !== undefined)    patch.missionHe = e.identity.missionHe
                if (e.identity.missionEn !== undefined)    patch.missionEn = e.identity.missionEn
                if (e.identity.manifestoHe !== undefined)  patch.manifestoHe = e.identity.manifestoHe
                if (e.identity.positioningLine !== undefined) patch.positioningLine = e.identity.positioningLine
            }
            if (e.logo)       patch.logo = e.logo
            if (e.colors)     patch.colors = e.colors
            if (e.typography) patch.typography = e.typography
            if (e.imagery)    patch.imagery = e.imagery
            if (e.voice)      patch.voice = e.voice
            if (e.components) patch.components = e.components
            if (e.compliance) patch.compliance = e.compliance
            if (e.principles) patch.principles = e.principles
        }

        // Archive previously approved version (partial-unique index requires this)
        await db.update(brandBooks)
            .set({ status: 'archived', updatedAt: new Date() })
            .where(and(
                eq(brandBooks.instanceId, instanceId),
                eq(brandBooks.status, 'approved'),
            ))

        // Apply patch
        await db.update(brandBooks).set(patch as any).where(eq(brandBooks.id, body.brandBookId))

        // Fetch the now-approved version
        const [approved] = await db.select().from(brandBooks).where(eq(brandBooks.id, body.brandBookId))

        // Distribute to tenant VPS: write BRAND_BOOK.json to workspace
        if (instance.ip && approved) {
            try {
                const brandBookForTenant = {
                    version: approved.version,
                    approvedAt: approved.approvedAt,
                    identity: {
                        businessName: approved.businessName,
                        legalName: approved.legalName,
                        taglineHe: approved.taglineHe,
                        taglineEn: approved.taglineEn,
                        missionHe: approved.missionHe,
                        missionEn: approved.missionEn,
                        manifestoHe: approved.manifestoHe,
                        positioningLine: approved.positioningLine,
                    },
                    logo: approved.logo,
                    colors: approved.colors,
                    typography: approved.typography,
                    imagery: approved.imagery,
                    voice: approved.voice,
                    components: approved.components,
                    principles: approved.principles,
                    compliance: approved.compliance,
                }
                const json = JSON.stringify(brandBookForTenant, null, 2)
                const b64 = Buffer.from(json, 'utf-8').toString('base64')
                await sshExec(
                    instance.ip,
                    `mkdir -p /home/openclaw/.openclaw/workspace && ` +
                    `echo '${b64}' | base64 -d > /home/openclaw/.openclaw/workspace/BRAND_BOOK.json && ` +
                    `chown openclaw:openclaw /home/openclaw/.openclaw/workspace/BRAND_BOOK.json`,
                    instance.rootPassword || undefined,
                    30000,
                )
                console.log(`[brand/approve] BRAND_BOOK.json distributed to ${instance.ip} (v${approved.version})`)
            } catch (distErr) {
                console.error('Failed to distribute BRAND_BOOK.json (non-fatal):', distErr)
                // Don't fail the approve — DB is source of truth
            }
        }

        return ok(c, { brandBookId: body.brandBookId, version: approved?.version }, 'Approved.')
    } catch (err) {
        console.error('approveBrandBook error:', err)
        return fail(c, 'Approve failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /hosting/instances/:id/brand
// Returns: current approved brand book (or latest pending_approval if none approved)
// ═══════════════════════════════════════════════════════════════════════════
export const getBrandBook = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        // Try approved first
        const [approved] = await db.select().from(brandBooks)
            .where(and(eq(brandBooks.instanceId, instanceId), eq(brandBooks.status, 'approved')))
            .limit(1)

        if (approved) return ok(c, { brandBook: approved, isApproved: true })

        // Fall back to latest pending_approval (most recent draft)
        const [draft] = await db.select().from(brandBooks)
            .where(and(eq(brandBooks.instanceId, instanceId), eq(brandBooks.status, 'pending_approval')))
            .orderBy(desc(brandBooks.version))
            .limit(1)

        if (draft) return ok(c, { brandBook: draft, isApproved: false })

        return ok(c, { brandBook: null, isApproved: false })
    } catch (err) {
        console.error('getBrandBook error:', err)
        return fail(c, 'Fetch failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /hosting/instances/:id/brand/versions
// Returns: all brand book versions for instance (archived + approved + drafts)
// ═══════════════════════════════════════════════════════════════════════════
export const getBrandBookVersions = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const rows = await db.select({
            id: brandBooks.id,
            version: brandBooks.version,
            status: brandBooks.status,
            source: brandBooks.source,
            businessName: brandBooks.businessName,
            createdAt: brandBooks.createdAt,
            approvedAt: brandBooks.approvedAt,
        }).from(brandBooks)
            .where(eq(brandBooks.instanceId, instanceId))
            .orderBy(desc(brandBooks.version))

        return ok(c, { versions: rows })
    } catch (err) {
        console.error('getBrandBookVersions error:', err)
        return fail(c, 'Fetch failed', 500)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function buildResearchSummary(instance: any): ResearchSummary | null {
    const rd = instance.researchData as any
    if (!rd) return null

    const summary: ResearchSummary = {}

    // Stage 1: business basics
    const s1 = rd.stage1 || rd.answers || {}
    if (s1.businessName) summary.businessName = s1.businessName
    if (s1.industry) summary.industry = s1.industry
    if (s1.targetMarket) summary.targetMarket = s1.targetMarket

    // Stage 2: competitors
    const s2 = rd.stage2 || {}
    if (s2.competitors) summary.competitors = s2.competitors.slice(0, 10)
    else if (rd.competitors) summary.competitors = rd.competitors.slice(0, 10)

    // Stage 3: positioning
    const s3 = rd.stage3 || {}
    if (s3.positioning) summary.positioning = s3.positioning
    else if (s3.positioningLine) summary.positioning = s3.positioningLine

    // Stage 4: personas
    const s4 = rd.stage4 || {}
    if (s4.personas) summary.personas = s4.personas.slice(0, 5)
    else if (rd.personas) summary.personas = rd.personas.slice(0, 5)

    return summary
}

function inferSource(body: any): 'extracted' | 'generated' | 'uploaded' | 'mixed' {
    const hasScraped = !!body.scraped
    const hasUserInputs = !!body.userInputs
    if (hasScraped && hasUserInputs) return 'mixed'
    if (hasScraped) return 'extracted'
    if (hasUserInputs) return 'generated'
    return 'generated'
}
