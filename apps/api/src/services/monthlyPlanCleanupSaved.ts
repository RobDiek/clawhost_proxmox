/**
 * Saved-plan Hebrew cleanup — runs the K17 Hebrew polish on an ALREADY-PERSISTED
 * monthly plan's per-task rows, in place. Decouples the cosmetic cleanup from the
 * critical generation→save path:
 *   - generator persists the plan immediately (never blocked by a slow/hung cleanup)
 *   - this pass runs AFTER save (fire-and-forget systemically, or manually) and
 *     rewrites each monthly_task row's title + content with cleaned Hebrew.
 *
 * The per-task row stores the user-facing title in the `title` COLUMN as
 * "P0 · <hebrew title>" and the rest of the task (summary/actionPlan/…) as a
 * JSON string in `content`. We reconstruct a task object, run the existing
 * batched cleanup (runMonthlyPlanHebrewCleanup — 90s/batch timeout, per-batch
 * fallback), and write the cleaned strings back, preserving the priority prefix.
 */
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import { runMonthlyPlanHebrewCleanup } from './monthlyPlanHebrewCleanup'
import { sanitizeTaskInPlace, residualEnglishWords } from './monthlyPlanTextSanitizer'

const PREFIX_RE = /^(P\d+)\s*·\s*/

export interface SavedCleanupResult {
    status: 'ok' | 'no_plan' | 'skipped' | 'error'
    reason?: string
    scanned?: number
    updated?: number
    dryRun?: boolean
    samples?: Array<{ before: string; after: string }>
}

export async function runSavedPlanHebrewCleanup(agentId: string | null, opts: { dryRun?: boolean; instanceId?: string } = {}): Promise<SavedCleanupResult> {
    const dryRun = !!opts.dryRun
    // Agentless tenants (no mateh_agents row) have no agentId — their rows are
    // written with agentId=null scoped by instanceId. Require one of the two.
    if (!agentId && !opts.instanceId) return { status: 'error', reason: 'need agentId or instanceId' }
    // Load this agent's monthly_task rows from the LATEST plan generation only.
    const since = new Date(Date.now() - 36 * 3600 * 1000)
    const scope = agentId
        ? eq(agentOutputs.agentId, agentId)
        : and(eq(agentOutputs.instanceId, opts.instanceId!), isNull(agentOutputs.agentId))
    const rows = await db.select().from(agentOutputs)
        .where(and(scope, eq(agentOutputs.outputType, 'monthly_task'), gt(agentOutputs.createdAt, since))) as any[]
    if (!rows.length) return { status: 'no_plan', reason: 'no recent monthly_task rows' }
    // scope to the most recent plan generation
    let latestGen = ''
    for (const r of rows) { const g = (r.metadata as any)?.monthlyPlanGeneratedAt || ''; if (g > latestGen) latestGen = g }
    const planRows = latestGen ? rows.filter(r => (r.metadata as any)?.monthlyPlanGeneratedAt === latestGen) : rows
    const instanceId = opts.instanceId || planRows[0]?.instanceId
    if (!instanceId) return { status: 'error', reason: 'no instanceId on rows' }

    // Reconstruct task objects (index-aligned with planRows).
    const tasks = planRows.map(r => {
        let c: any = r.content
        if (typeof c === 'string') { try { c = JSON.parse(c) } catch { c = {} } }
        const m = PREFIX_RE.exec(r.title || '')
        const prefix = m ? m[1] : ((r.metadata as any)?.priority || '')
        const bareTitle = (r.title || '').replace(PREFIX_RE, '')
        return { title: bareTitle, summary: c.summary, actionPlan: c.actionPlan, expectedImpact: c.expectedImpact, sources: c.sources, _prefix: prefix, _content: c }
    })
    // Strip our private fields before sending to the cleanup LLM.
    const forClean = tasks.map(t => ({ title: t.title, summary: t.summary, actionPlan: t.actionPlan, expectedImpact: t.expectedImpact, sources: t.sources }))

    const cleanup = await runMonthlyPlanHebrewCleanup({ tasks: forClean as unknown as Array<Record<string, unknown>>, instanceId })
    const llmApplied = !!(cleanup.applied && cleanup.cleanedTasks && cleanup.cleanedTasks.length === planRows.length)

    // The deterministic text floor ALWAYS runs — on the LLM-cleaned tasks when
    // available, otherwise on the reconstructed originals. This guarantees the
    // saved rows are free of machine tokens even when the LLM cleanup was
    // skipped/timed-out (the previous early-return left raw rows in place).
    const base: any[] = llmApplied ? (cleanup.cleanedTasks as any[]) : (forClean as any[])

    const samples: Array<{ before: string; after: string }> = []
    const residualSet = new Set<string>()
    let updated = 0
    for (let i = 0; i < planRows.length; i++) {
        const row = planRows[i]
        const cleaned: any = base[i] || {}
        sanitizeTaskInPlace(cleaned)   // deterministic floor (mutates in place)
        const orig = tasks[i]

        // collect residual English for visibility (non-blocking)
        for (const field of [cleaned.title, cleaned.summary, cleaned.expectedImpact?.rationale]) {
            for (const w of residualEnglishWords(typeof field === 'string' ? field : '')) residualSet.add(w)
        }

        const newTitle = orig._prefix ? `${orig._prefix} · ${cleaned.title || orig.title}` : (cleaned.title || orig.title)
        // rebuild content: original parsed content + cleaned string fields (content has NO title field)
        const newContent = { ...orig._content }
        if (cleaned.summary !== undefined) newContent.summary = cleaned.summary
        if (cleaned.actionPlan !== undefined) newContent.actionPlan = cleaned.actionPlan
        if (cleaned.expectedImpact !== undefined) newContent.expectedImpact = cleaned.expectedImpact
        if (cleaned.sources !== undefined) newContent.sources = cleaned.sources

        const newContentJson = JSON.stringify(newContent)
        const changed = newTitle !== row.title || newContentJson !== (typeof row.content === 'string' ? row.content : JSON.stringify(row.content))
        if (samples.length < 6 && newTitle !== row.title) samples.push({ before: row.title, after: newTitle })
        if (changed) {
            if (!dryRun) {
                await db.update(agentOutputs).set({ title: newTitle, content: newContentJson }).where(eq(agentOutputs.id, row.id))
            }
            updated++
        }
    }
    const residual = Array.from(residualSet).slice(0, 25)
    console.log(`[savedPlanHebrewCleanup] ${agentId || instanceId}: ${dryRun ? 'DRY ' : ''}updated ${updated}/${planRows.length} rows (gen=${latestGen}; llm=${llmApplied ? 'applied' : 'skipped:' + (cleanup.reason || '?')}; floor=deterministic)${residual.length ? `; residual-English: ${residual.join(', ')}` : ''}`)
    return { status: 'ok', scanned: planRows.length, updated, dryRun, samples }
}