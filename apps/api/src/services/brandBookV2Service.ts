/**
 * Brand Book v2 Service — versioning + approval workflow.
 *
 * Each row in `brand_books` table represents ONE version. Status flow:
 *   draft → pending_approval → approved → archived
 *
 * Rules:
 *   - Only one `approved` row per instance at a time (creating new approved
 *     archives the previous)
 *   - `draft` and `pending_approval` rows are mutable
 *   - `approved` and `archived` are immutable (any change creates new draft)
 *   - When new approved goes live, all dependent pipelines (mazhir_media_plan,
 *     content_plan) get a "stale" signal so next regeneration uses fresh book
 *
 * Storage layout: BrandBookV2 JSON stored across existing jsonb columns
 *   - `identity` → composed into description/voice/missionHe (legacy compat)
 *   - `visual.logo` → `logo` jsonb
 *   - `visual.colors` → `colors` jsonb
 *   - `visual.typography` → `typography` jsonb
 *   - `visual.imagery` → `imagery` jsonb
 *   - `voice` → `voice` jsonb
 *   - new fields stored in `principles` jsonb for forward-compat
 *   - full v2 doc in a NEW jsonb column `book_v2_doc` (added later if needed)
 *
 * For now: store full BrandBookV2 doc as `principles.bookV2` — it's a
 * non-breaking jsonb extension, no migration needed.
 */

import { eq, and, desc } from 'drizzle-orm'
import { db } from '@/db'
import { brandBooks, instances } from '@/db/schema'
import type {
    BrandBookV2,
    BrandKeyMeta,
    BrandKeyConfidence,
    BrandKeySource,
} from '../../../../packages/shared/src/brand/brandBookV2'
import { evaluateQualityGates, deriveOverallConfidence } from '../../../../packages/shared/src/brand/brandBookV2'
import { randomBytes } from 'crypto'

export interface BrandRowSummary {
    id: string
    instanceId: string
    version: number
    status: string
    createdAt: Date | null
    approvedAt: Date | null
    overallConfidence?: BrandKeyConfidence
}

function newId(): string {
    return 'bb_' + randomBytes(8).toString('hex')
}

/**
 * Inflate a raw `brand_books` row into a full BrandBookV2 doc.
 * Falls back to v1 fields if `principles.bookV2` isn't populated yet.
 */
export function rowToBookV2(row: any): BrandBookV2 {
    if (!row) throw new Error('Empty brand_books row')
    const principlesObj = (row.principles && typeof row.principles === 'object') ? row.principles : {}
    // Pull authoritative scan/source signals from the DB row regardless of
    // which path returns the book — the Brand wizard frontend uses these to
    // decide whether to surface "scan now" vs "scan blocked" vs "scan done"
    // banners. Previously we only set sourceFlow on the legacy synth path
    // (and even there hard-coded 'imported_from_v1', losing the real source),
    // and never returned sourceScrapedAt at all — so the UI couldn't tell.
    const dbScrapedAt = row.sourceScrapedAt?.toISOString?.() || undefined
    const dbSourceUrl = row.sourceUrl || undefined
    const dbSourceFlow = (row.source && ['uploaded', 'website_scan', 'mixed', 'imported_from_v1'].includes(row.source))
        ? row.source as BrandBookV2['sourceFlow']
        : 'imported_from_v1'
    if (principlesObj.bookV2) {
        // Modern path — augment with DB-row scan metadata so the wizard can
        // detect "scan ran" vs "scan never ran" even on rows persisted before
        // the scan-status fields existed in the bookV2 doc.
        const book = principlesObj.bookV2 as BrandBookV2
        if (!(book as any).sourceScrapedAt && dbScrapedAt) (book as any).sourceScrapedAt = dbScrapedAt
        if (!(book as any).sourceUrl && dbSourceUrl) (book as any).sourceUrl = dbSourceUrl
        if (!book.sourceFlow || book.sourceFlow === 'imported_from_v1') book.sourceFlow = dbSourceFlow
        return book
    }
    // Legacy v1 → synthesize v2 shell so consumers can read both
    const baseMeta = (source: BrandKeySource = 'extracted', confidence: BrandKeyConfidence = 'medium'): BrandKeyMeta => ({
        confidence, source, updatedAt: row.updatedAt?.toISOString?.() || new Date().toISOString(),
    })
    const v2: BrandBookV2 = {
        version: row.version || 1,
        status: row.status || 'draft',
        schemaVersion: 2,
        instanceId: row.instanceId,
        createdAt: row.createdAt?.toISOString?.() || new Date().toISOString(),
        updatedAt: row.updatedAt?.toISOString?.() || new Date().toISOString(),
        approvedAt: row.approvedAt?.toISOString?.() || undefined,
        sourceFlow: dbSourceFlow,
        identity: {
            businessName: row.businessName ? { he: row.businessName, ...baseMeta('extracted', 'medium') } : undefined,
            legalName: row.legalName ? { value: row.legalName, ...baseMeta('extracted', 'medium') } : undefined,
            tagline: (row.taglineHe || row.taglineEn) ? { he: row.taglineHe, en: row.taglineEn, ...baseMeta('extracted', 'medium') } : undefined,
            mission: (row.missionHe || row.missionEn) ? { he: row.missionHe, en: row.missionEn, ...baseMeta('extracted', 'medium') } : undefined,
            manifesto: row.manifestoHe ? { he: row.manifestoHe, ...baseMeta('extracted', 'medium') } : undefined,
            positioningStatement: row.positioningLine ? { he: row.positioningLine, ...baseMeta('extracted', 'medium') } : undefined,
        },
        visual: {
            logo: row.logo ? { ...row.logo, ...baseMeta('uploaded', 'high') } : undefined,
            colors: row.colors ? { ...row.colors, ...baseMeta('extracted', 'medium') } : undefined,
            typography: row.typography ? { ...row.typography, ...baseMeta('extracted', 'medium') } : undefined,
            imagery: row.imagery ? { ...row.imagery, ...baseMeta('extracted', 'medium') } : undefined,
        },
        voice: {
            voice: row.voice ? { ...row.voice, ...baseMeta('extracted', 'medium') } : undefined,
        },
        audience: {},
        compliance: {},
        channelAssets: {},
    }
    if (dbScrapedAt) (v2 as any).sourceScrapedAt = dbScrapedAt
    if (dbSourceUrl) (v2 as any).sourceUrl = dbSourceUrl
    return v2
}

/**
 * Persist a BrandBookV2 doc back to the row, updating both legacy fields
 * (for backwards compat with older readers) and the new `principles.bookV2`
 * holder.
 */
async function persistBookToRow(rowId: string, book: BrandBookV2): Promise<void> {
    const principles: any = { bookV2: book }
    const updates: any = {
        status: book.status,
        version: book.version,
        principles,
        // Legacy mirror for old readers
        businessName: book.identity.businessName?.he || book.identity.businessName?.en,
        legalName: book.identity.legalName?.value,
        taglineHe: book.identity.tagline?.he,
        taglineEn: book.identity.tagline?.en,
        missionHe: book.identity.mission?.he,
        missionEn: book.identity.mission?.en,
        manifestoHe: book.identity.manifesto?.he,
        positioningLine: book.identity.positioningStatement?.he || book.identity.positioningStatement?.en,
        logo: book.visual.logo,
        colors: book.visual.colors,
        typography: book.visual.typography,
        imagery: book.visual.imagery,
        voice: book.voice.voice,
        updatedAt: new Date(),
        confidence: book.overallConfidence,
    }
    if (book.status === 'approved') {
        updates.approvedAt = new Date()
        updates.pdfUrl = book.pdfUrl
        updates.pdfGeneratedAt = book.pdfGeneratedAt ? new Date(book.pdfGeneratedAt) : null
    }
    await db.update(brandBooks).set(updates).where(eq(brandBooks.id, rowId))
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Phase 2.3.G — resolve which mateh_agent's brand books to operate on.
 * If agentId is passed → filter by that agent. Otherwise default to the
 * primary mateh_agent for backwards compatibility. Returns the where-clause
 * fragment that callers and-merge into their query.
 */
async function brandWhere(instanceId: string, agentId?: string) {
    let resolvedAgentId = agentId || null
    if (!resolvedAgentId) {
        const { resolvePrimaryAgent } = await import('@/services/agentContext')
        const primary = await resolvePrimaryAgent(instanceId)
        resolvedAgentId = primary?.id || null
    }
    return resolvedAgentId
        ? and(eq(brandBooks.instanceId, instanceId), eq(brandBooks.agentId, resolvedAgentId))
        : eq(brandBooks.instanceId, instanceId)
}

/**
 * Get current draft for an instance, or null. Draft is the working copy —
 * NEVER returns approved/archived (use getApproved for that).
 */
export async function getCurrentDraft(instanceId: string, agentId?: string): Promise<{ rowId: string; book: BrandBookV2 } | null> {
    const baseWhere = await brandWhere(instanceId, agentId)
    const rows = await db.select().from(brandBooks)
        .where(and(baseWhere, eq(brandBooks.status, 'draft')))
        .orderBy(desc(brandBooks.version))
        .limit(1)
    if (rows.length === 0) return null
    return { rowId: rows[0].id, book: rowToBookV2(rows[0]) }
}

/** Get the currently approved book (used by Mazhir / content plan / executors) */
export async function getApprovedBook(instanceId: string, agentId?: string): Promise<BrandBookV2 | null> {
    const baseWhere = await brandWhere(instanceId, agentId)
    const rows = await db.select().from(brandBooks)
        .where(and(baseWhere, eq(brandBooks.status, 'approved')))
        .limit(1)
    if (rows.length === 0) return null
    return rowToBookV2(rows[0])
}

/** Latest version any status */
export async function getLatest(instanceId: string, agentId?: string): Promise<{ rowId: string; book: BrandBookV2 } | null> {
    const baseWhere = await brandWhere(instanceId, agentId)
    const rows = await db.select().from(brandBooks)
        .where(baseWhere)
        .orderBy(desc(brandBooks.version))
        .limit(1)
    if (rows.length === 0) return null
    return { rowId: rows[0].id, book: rowToBookV2(rows[0]) }
}

/**
 * Start a NEW draft for an instance. Returns the empty book skeleton.
 *
 * `sourceFlow`: 'uploaded' (client has brand) or 'website_scan' (we discover)
 * `startedFromScratch`: client clicked "start over" — wipes prior data
 *
 * If `startedFromScratch=true`, archives the current approved book first.
 */
export async function startNewDraft(args: {
    instanceId: string
    sourceFlow: BrandBookV2['sourceFlow']
    startedFromScratch?: boolean
    agentId?: string
}): Promise<{ rowId: string; book: BrandBookV2 }> {
    const { instanceId, sourceFlow, startedFromScratch, agentId } = args

    // Phase 2.3.G — per-agent isolation
    let resolvedAgentId = agentId || null
    if (!resolvedAgentId) {
        const { resolvePrimaryAgent } = await import('@/services/agentContext')
        const primary = await resolvePrimaryAgent(instanceId)
        resolvedAgentId = primary?.id || null
    }
    const baseWhere = resolvedAgentId
        ? and(eq(brandBooks.instanceId, instanceId), eq(brandBooks.agentId, resolvedAgentId))
        : eq(brandBooks.instanceId, instanceId)

    // Optional: archive approved if user explicitly wants from scratch
    if (startedFromScratch) {
        await db.update(brandBooks)
            .set({ status: 'archived' })
            .where(and(baseWhere, eq(brandBooks.status, 'approved')))
        // Also drop existing draft (replaced by new fresh one)
        await db.delete(brandBooks)
            .where(and(baseWhere, eq(brandBooks.status, 'draft')))
    }

    // Find next version number
    const latest = await getLatest(instanceId, agentId)
    const version = (latest?.book.version || 0) + 1

    // If non-from-scratch and existing draft → just return it (don't create dupe)
    const existingDraft = await getCurrentDraft(instanceId, agentId)
    if (!startedFromScratch && existingDraft) return existingDraft

    const now = new Date().toISOString()

    // Auto-prefill businessName + tagline from all available sources before
    // ever asking client / scanning website. We've already done research,
    // strategy, paid profile — the data is here, just spread across tables.
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    const rd: any = inst?.researchData || {}
    const ans: any = rd.answers || {}
    const pp: any = rd.paidProfile || {}
    const [legacyBrand] = await db.select().from(brandBooks)
        .where(and(eq(brandBooks.instanceId, instanceId)))
        .orderBy(desc(brandBooks.version))
        .limit(1)

    const inferredBusinessName: string =
        ans.businessName
        || pp.businessName
        || (legacyBrand as any)?.businessName
        || ans.brandName
        || ''
    const inferredTagline: string =
        ans.tagline
        || ans.slogan
        || (legacyBrand as any)?.taglineHe
        || (legacyBrand as any)?.taglineEn
        || ''
    const inferredMission: string =
        ans.mission
        || (legacyBrand as any)?.missionHe
        || (legacyBrand as any)?.missionEn
        || ''
    const inferredWebsite: string = ans.websiteUrl || pp.businessUrl || ''

    const book: BrandBookV2 = {
        version,
        status: 'draft',
        schemaVersion: 2,
        instanceId,
        createdAt: now,
        updatedAt: now,
        sourceFlow,
        startedFromScratch,
        identity: {
            ...(inferredBusinessName ? {
                businessName: { he: inferredBusinessName, en: inferredBusinessName, confidence: 'high', source: 'system', updatedAt: now } as any,
            } : {}),
            ...(inferredTagline ? {
                tagline: { he: inferredTagline, confidence: 'medium', source: 'system', updatedAt: now } as any,
            } : {}),
            ...(inferredMission ? {
                mission: { he: inferredMission, confidence: 'medium', source: 'system', updatedAt: now } as any,
            } : {}),
        },
        visual: {},
        voice: {},
        audience: {},
        compliance: {},
        channelAssets: {},
    }
    // Stash website URL on instance-level (used by AI gen as default arg)
    if (inferredWebsite) (book as any).websiteUrl = inferredWebsite
    const rowId = newId()
    await db.insert(brandBooks).values({
        id: rowId,
        instanceId,
        agentId: resolvedAgentId,  // Phase 2.3.G — per-agent isolation
        version,
        status: 'draft',
        source: sourceFlow,
        principles: { bookV2: book },
        createdAt: new Date(),
        updatedAt: new Date(),
    } as any)
    return { rowId, book }
}

/**
 * Update specific keys in the current draft. Path-based update — caller
 * sends `{ "visual.colors.primary": {...} }` style. Validates the update
 * doesn't violate immutability of approved books (only draft mutable).
 */
export async function updateDraftKeys(
    instanceId: string,
    updates: Record<string, any>,
    agentId?: string,
): Promise<{ rowId: string; book: BrandBookV2 }> {
    const draft = await getCurrentDraft(instanceId, agentId)
    if (!draft) throw new Error('No draft found — call startNewDraft first')
    const { rowId, book } = draft

    for (const [path, value] of Object.entries(updates)) {
        const parts = path.split('.')
        let cur: any = book
        for (let i = 0; i < parts.length - 1; i++) {
            const k = parts[i]
            if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {}
            cur = cur[k]
        }
        cur[parts[parts.length - 1]] = value
    }
    book.updatedAt = new Date().toISOString()
    book.overallConfidence = deriveOverallConfidence(book)

    await persistBookToRow(rowId, book)
    return { rowId, book }
}

/**
 * Submit draft for approval. Must pass quality gates first.
 */
export async function submitForApproval(
    instanceId: string,
    agentId?: string,
): Promise<{ ok: boolean; book?: BrandBookV2; gates?: any; reason?: string }> {
    const draft = await getCurrentDraft(instanceId, agentId)
    if (!draft) return { ok: false, reason: 'No draft to submit' }
    const gates = evaluateQualityGates(draft.book)
    draft.book.qualityGates = {
        passed: gates.passed,
        items: gates.items.map(i => ({ key: i.key, passed: i.passed, reason: i.passed ? undefined : i.labelHe })),
    }
    if (!gates.passed) {
        await persistBookToRow(draft.rowId, draft.book)
        return { ok: false, gates, reason: 'Critical quality gates failed: ' + gates.criticalFailed.join(', ') }
    }
    draft.book.status = 'pending_approval'
    draft.book.updatedAt = new Date().toISOString()
    await persistBookToRow(draft.rowId, draft.book)
    return { ok: true, book: draft.book, gates }
}

/**
 * Approve the draft (or pending_approval). Archives previously-approved.
 * Triggers downstream stale signal for Mazhir / content plan.
 */
export async function approveDraft(args: {
    instanceId: string
    userId?: string
    skipGates?: boolean
    agentId?: string
}): Promise<{ ok: boolean; book?: BrandBookV2; reason?: string }> {
    const { instanceId, userId, skipGates, agentId } = args
    const baseWhere = await brandWhere(instanceId, agentId)

    // Find draft or pending_approval — Phase 2.3.G scoped to active agent
    const candidates = await db.select().from(brandBooks)
        .where(baseWhere)
        .orderBy(desc(brandBooks.version))
    const candidate = candidates.find(r => r.status === 'pending_approval' || r.status === 'draft')
    if (!candidate) return { ok: false, reason: 'No draft/pending found' }

    const book = rowToBookV2(candidate)
    if (!skipGates) {
        const gates = evaluateQualityGates(book)
        if (!gates.passed) return { ok: false, reason: 'Quality gates failed: ' + gates.criticalFailed.join(', ') }
    }

    // Archive existing approved (only THIS agent's)
    await db.update(brandBooks)
        .set({ status: 'archived' })
        .where(and(baseWhere, eq(brandBooks.status, 'approved')))

    book.status = 'approved'
    book.approvedAt = new Date().toISOString()
    book.approvedByUserId = userId
    book.overallConfidence = deriveOverallConfidence(book)
    await persistBookToRow(candidate.id, book)

    // Note: instances.hasBrandBook column doesn't exist — the flag is derived
    // at read time from brand_books query (see auth.ts /my-instances and
    // instances.ts overlay). Removed errant UPDATE that caused 500s.

    // TODO: emit "brand book changed" event so dependent pipelines re-run on next cycle
    // (mazhir_media_plan + content_plan read on every regen, so no immediate action needed)
    return { ok: true, book }
}

/** Discard current draft (returns to last approved state) */
export async function discardDraft(instanceId: string, agentId?: string): Promise<{ ok: boolean }> {
    const baseWhere = await brandWhere(instanceId, agentId)
    await db.delete(brandBooks)
        .where(and(baseWhere, eq(brandBooks.status, 'draft')))
    return { ok: true }
}

/** Start over — archive everything, fresh draft */
export async function startOverFresh(args: {
    instanceId: string
    sourceFlow: BrandBookV2['sourceFlow']
    agentId?: string
}): Promise<{ rowId: string; book: BrandBookV2 }> {
    return startNewDraft({ instanceId: args.instanceId, sourceFlow: args.sourceFlow, startedFromScratch: true, agentId: args.agentId })
}

/** Edit an approved book → creates a new draft cloned from approved */
export async function editApproved(instanceId: string, agentId?: string): Promise<{ rowId: string; book: BrandBookV2 }> {
    const approved = await getApprovedBook(instanceId, agentId)
    if (!approved) throw new Error('No approved book to edit')
    // Clone approved into new draft
    const latest = await getLatest(instanceId, agentId)
    const newVersion = (latest?.book.version || 0) + 1
    const draft: BrandBookV2 = {
        ...approved,
        version: newVersion,
        status: 'draft',
        sourceFlow: 'mixed',
        startedFromScratch: false,
        approvedAt: undefined,
        approvedByUserId: undefined,
        updatedAt: new Date().toISOString(),
    }
    // Resolve agent for INSERT
    let resolvedAgentId = agentId || null
    if (!resolvedAgentId) {
        const { resolvePrimaryAgent } = await import('@/services/agentContext')
        const primary = await resolvePrimaryAgent(instanceId)
        resolvedAgentId = primary?.id || null
    }
    const rowId = newId()
    await db.insert(brandBooks).values({
        id: rowId,
        instanceId,
        agentId: resolvedAgentId,
        version: newVersion,
        status: 'draft',
        source: 'mixed',
        principles: { bookV2: draft },
        createdAt: new Date(),
        updatedAt: new Date(),
    } as any)
    return { rowId, book: draft }
}

/** History of all versions */
export async function getHistory(instanceId: string, agentId?: string): Promise<BrandRowSummary[]> {
    const baseWhere = await brandWhere(instanceId, agentId)
    const rows = await db.select().from(brandBooks)
        .where(baseWhere)
        .orderBy(desc(brandBooks.version))
    return rows.map(r => ({
        id: r.id,
        instanceId: r.instanceId,
        version: r.version,
        status: r.status,
        createdAt: r.createdAt as any,
        approvedAt: r.approvedAt as any,
        overallConfidence: (r.confidence as any) || undefined,
    }))
}