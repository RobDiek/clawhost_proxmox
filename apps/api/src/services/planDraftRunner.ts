/**
 * Plan Draft Runner (Phase 3: Agent-to-plan binding)
 *
 * For every content plan item that becomes "due" (date <= today, time within
 * the next hour, status = 'planned'), we generate a draft server-side using
 * Sonnet 4.6 grounded in: brief, hook, brand voice, recent stats.
 *
 * Draft is written to agent_outputs with metadata.contentPlanItemId linking
 * back to the plan item, so publisher auto-sync (Phase B.1) can close the
 * loop when the user approves + publishes.
 *
 * Runs hourly on mgmt. Idempotent — skips items that already have a draft.
 * Manual trigger: POST /instances/:id/content-plan/items/:itemId/draft
 */
import { randomBytes } from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances, agentOutputs } from '@/db/schema'
import { getApiKeyForInstance, formatAgentStats, formatLatestOptimizationReport } from '@/controllers/hosting/agentSetup'

const RUNNER_INTERVAL_MS = 60 * 60 * 1000   // every 60 min
const DUE_WINDOW_MS = 60 * 60 * 1000        // produce drafts up to 60 min before scheduled time
const MAX_DRAFTS_PER_SWEEP = 3              // per instance, to rate-limit API spend

interface PlanItem {
    id: string
    date: string
    time: string
    channel: string
    type: string
    pillar: string
    hook: string
    brief: string
    persona: string
    ctaType: string
    productRef?: string
    flexibility: string
    status: string
    agentRole: string
    publishedAt?: string
    channelPostId?: string
}

interface GenContext {
    businessName: string
    brandVoice: string
    products: unknown[]
    productsFunnel?: string
    statsBlock: string
    optimizationBlock: string
}

async function generateDraftContent(
    apiKey: string,
    item: PlanItem,
    ctx: GenContext,
): Promise<{ title: string; content: string } | null> {
    const prompt = `אתם ${item.agentRole}, סוכן תוכן של ${ctx.businessName}. המשימה: לכתוב את התוכן המלא של הפריט הבא (לא בריף — התוכן הסופי שייכנס לפלטפורמה).

## הקשר הפריט
- תאריך ושעה: ${item.date} ${item.time} (Asia/Jerusalem)
- פלטפורמה: ${item.channel}
- פורמט: ${item.type}
- עמוד תוכן (pillar): "${item.pillar}"
- פרסונת יעד: ${item.persona}
- מוצר: ${item.productRef || 'משולב'}
- CTA: ${item.ctaType}

## הוק מוצע (אפשר לשמור או לחדד)
${item.hook}

## הבריף המלא (הוראות לקופירייטר)
${item.brief}

## קול מותג ואסטרטגיה
${ctx.brandVoice.substring(0, 3500)}

${ctx.optimizationBlock}
${ctx.statsBlock}

## חוקים קריטיים
- **100% עברית** — אפס מילים באנגלית (AI → בינה מלאכותית, CTA → קריאה לפעולה, ROI → החזר השקעה, וכו')
- כתבו את **התוכן הסופי** — לא בריף, לא הסבר, לא מטא. זה מה שהולך ללוח הפלטפורמה.
- הקפידו על אורך מתאים לפלטפורמה (FB: 150-250 מילים, IG: 100-200, Blog: 800-1500, LinkedIn: 150-300, Email: 200-400)
- אם הפלטפורמה היא email או blog — החזירו גם כותרת בפורמט "title:" בשורה ראשונה

## תפוקה — JSON בלבד
{
  "title": "<כותרת הפריט — קצרה, 3-8 מילים>",
  "content": "<התוכן המלא בעברית — מוכן לפרסום, כולל hook פתיחה, גוף, CTA וHashtagים אם רלוונטי>"
}`

    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-6',
                max_tokens: 3000,
                messages: [{ role: 'user', content: prompt }],
            }),
            signal: AbortSignal.timeout(120000),
        })
        if (!res.ok) {
            console.warn(`[planDraftRunner] generate ${item.id} API ${res.status}`)
            return null
        }
        const data = await res.json() as { content?: Array<{ type?: string; text?: string }> }
        const text = (data.content?.find(c => c.type === 'text')?.text || '').trim()
        // Extract outermost JSON object
        const firstBrace = text.indexOf('{')
        const lastBrace = text.lastIndexOf('}')
        if (firstBrace < 0 || lastBrace < 0) return null
        let raw = text.substring(firstBrace, lastBrace + 1)
        // Sanitize control characters that would break JSON.parse. The no-control-regex
        // rule catches raw control ranges in source — this filter iterates char codes instead.
        raw = Array.from(raw).map(ch => {
            const code = ch.charCodeAt(0)
            if (code < 32 && ch !== '\n' && ch !== '\t' && ch !== '\r') return ''
            return ch
        }).join('')
        const parsed = JSON.parse(raw) as { title?: string; content?: string }
        if (!parsed.content) return null
        return {
            title: String(parsed.title || item.hook || 'תוכן חדש'),
            content: String(parsed.content),
        }
    } catch (err) {
        console.warn(`[planDraftRunner] generate ${item.id} error:`, (err as Error).message)
        return null
    }
}

/**
 * Core: for one instance, draft all due planned items (up to MAX_DRAFTS_PER_SWEEP).
 * Exported so manual endpoint can invoke with single-item override.
 */
export async function draftDuePlanItemsForInstance(
    instanceId: string,
    opts: { onlyItemId?: string; now?: Date } = {},
): Promise<{ drafted: string[]; skipped: number; failed: string[] }> {
    const now = opts.now || new Date()
    const drafted: string[] = []
    const failed: string[] = []
    let skipped = 0

    const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!instance) return { drafted, skipped, failed }

    const rd = (instance.researchData as Record<string, unknown>) || {}
    const plan = (Array.isArray(rd.contentPlan) ? rd.contentPlan : []) as PlanItem[]
    if (plan.length === 0) return { drafted, skipped, failed }

    const answers = (rd.answers as Record<string, unknown>) || {}
    const strategy = [rd.strategyStage1, rd.strategyStage2, rd.strategyStage3, rd.strategyStage4]
        .filter(Boolean)
        .join('\n\n')
        .toString()
        .substring(0, 12000)
    const ctx: GenContext = {
        businessName: String(answers.businessName || 'העסק'),
        brandVoice: strategy,
        products: (answers.products as unknown[]) || [],
        productsFunnel: answers.productsFunnel as string | undefined,
        statsBlock: formatAgentStats(rd, { sinceDays: 60 }),
        optimizationBlock: formatLatestOptimizationReport(rd),
    }

    const apiKey = await getApiKeyForInstance(instanceId)
    if (!apiKey) {
        console.warn(`[planDraftRunner] ${instanceId}: no API key, skipping`)
        return { drafted, skipped, failed }
    }

    // Which items are due? plan item date+time within the draft window
    const dueItems: PlanItem[] = []
    for (const item of plan) {
        if (opts.onlyItemId && item.id !== opts.onlyItemId) continue
        if (item.status !== 'planned') { skipped++; continue }
        const schedMs = new Date(`${item.date}T${item.time || '09:00'}:00+03:00`).getTime()
        const diff = schedMs - now.getTime()
        if (opts.onlyItemId || diff <= DUE_WINDOW_MS) {
            dueItems.push(item)
        }
    }
    if (dueItems.length === 0) return { drafted, skipped, failed }

    // Idempotency: skip items that already have an output with their id in metadata
    const existing = await db.select({ id: agentOutputs.id, metadata: agentOutputs.metadata })
        .from(agentOutputs)
        .where(eq(agentOutputs.instanceId, instanceId))
    const linkedIds = new Set<string>()
    for (const o of existing) {
        const md = (o.metadata as Record<string, unknown> | null) || {}
        if (md.contentPlanItemId) linkedIds.add(String(md.contentPlanItemId))
    }

    const toProcess = dueItems
        .filter(it => !linkedIds.has(it.id))
        .slice(0, opts.onlyItemId ? 1 : MAX_DRAFTS_PER_SWEEP)

    for (const item of toProcess) {
        // Transition to drafting (immediate save to prevent race if cron fires again)
        item.status = 'drafting'
        await db.update(instances).set({
            researchData: { ...rd, contentPlan: plan } as unknown as Record<string, unknown>,
        }).where(eq(instances.id, instanceId))

        const generated = await generateDraftContent(apiKey, item, ctx)
        if (!generated) {
            failed.push(item.id)
            item.status = 'planned' // revert so retry works next sweep
            continue
        }

        // Persist draft as agent_output linked by metadata.contentPlanItemId
        const outputId = randomBytes(6).toString('hex')
        await db.insert(agentOutputs).values({
            id: outputId,
            instanceId,
            agentRole: item.agentRole || 'yotzer',
            outputType: item.type === 'article' ? 'blog_article' : 'content_post',
            title: generated.title,
            content: generated.content,
            platform: item.channel,
            scheduledFor: new Date(`${item.date}T${item.time || '09:00'}:00+03:00`),
            metadata: {
                contentPlanItemId: item.id,
                pillar: item.pillar,
                persona: item.persona,
                ctaType: item.ctaType,
                productRef: item.productRef,
                hook: item.hook,
                generatedAt: new Date().toISOString(),
                generatedBy: 'planDraftRunner',
            },
            status: 'pending_review',
        })

        // Transition plan item to awaiting_review + link outputId
        item.status = 'awaiting_review' as PlanItem['status']
        ;(item as unknown as { outputId?: string }).outputId = outputId
        drafted.push(item.id)
    }

    // Persist final plan state
    await db.update(instances).set({
        researchData: { ...rd, contentPlan: plan } as unknown as Record<string, unknown>,
    }).where(eq(instances.id, instanceId))

    if (drafted.length > 0) {
        console.log(`[planDraftRunner] ${instanceId}: drafted ${drafted.length}, failed ${failed.length}`)
    }
    return { drafted, skipped, failed }
}

async function sweepAllInstances(): Promise<void> {
    const live = await db.select({ id: instances.id }).from(instances)
    let totalDrafted = 0
    let totalFailed = 0
    for (const row of live) {
        try {
            const res = await draftDuePlanItemsForInstance(row.id)
            totalDrafted += res.drafted.length
            totalFailed += res.failed.length
        } catch (err) {
            console.warn(`[planDraftRunner] ${row.id} sweep error:`, (err as Error).message)
            totalFailed++
        }
    }
    if (totalDrafted > 0 || totalFailed > 0) {
        console.log(`[planDraftRunner] sweep done: +${totalDrafted} drafted, ${totalFailed} failed`)
    }
}

let _started = false
export function startPlanDraftRunner(): void {
    if (_started) return
    _started = true
    console.log(`[planDraftRunner] starting (interval ${RUNNER_INTERVAL_MS / 60_000}min)`)
    setTimeout(() => { sweepAllInstances().catch(err => console.error('[planDraftRunner] startup run failed:', err)) }, 5 * 60 * 1000)
    setInterval(() => { sweepAllInstances().catch(err => console.error('[planDraftRunner] interval run failed:', err)) }, RUNNER_INTERVAL_MS)
}