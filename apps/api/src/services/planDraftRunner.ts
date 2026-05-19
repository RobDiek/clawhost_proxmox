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
import { getApiKeyForInstance, formatAgentStats, formatLatestOptimizationReport, resolveDirectModel } from '@/controllers/hosting/agentSetup'

const RUNNER_INTERVAL_MS = 60 * 60 * 1000   // every 60 min
const DUE_WINDOW_MS = 60 * 60 * 1000        // produce drafts up to 60 min before scheduled time
const MAX_DRAFTS_PER_SWEEP = 3              // per instance, to rate-limit API spend
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://clawflow.flowmatic.co.il'

// Send a short Telegram notification to the instance owner when a draft is
// ready. Best-effort — never throws, never blocks the pipeline.
async function notifyDraftReady(
    instance: { id: string; telegramBotToken: string | null; telegramChatId: string | null },
    item: PlanItem,
    title: string,
): Promise<void> {
    if (!instance.telegramBotToken || !instance.telegramChatId) return

    const channelHe: Record<string, string> = {
        facebook: 'פייסבוק', instagram: 'אינסטגרם', blog: 'בלוג', email: 'ניוזלטר',
        youtube: 'יוטיוב', linkedin: 'לינקדאין', tiktok: 'טיקטוק',
        google_ads: 'גוגל אדס', meta_ads: 'מטא אדס', reddit: 'רדיט',
    }
    const channelLabel = channelHe[item.channel] || item.channel
    const approvalsUrl = `${FRONTEND_URL}/dashboard#tab=home`

    const text =
        `🆕 *טיוטה חדשה מוכנה לאישור*\n\n` +
        `*${title}*\n\n` +
        `📅 ${item.date} · ${channelLabel}\n` +
        `🎯 ${item.pillar}\n\n` +
        `[לאישור →](${approvalsUrl})`

    try {
        await fetch(`https://api.telegram.org/bot${instance.telegramBotToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: instance.telegramChatId,
                text,
                parse_mode: 'Markdown',
                disable_web_page_preview: true,
            }),
            signal: AbortSignal.timeout(10000),
        })
    } catch {
        // Swallow — never block pipeline on notification failure
    }
}

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

// SEO/AEO output shape for articles + blog posts.
// Non-article items return just { title, content } — the extras are ignored.
export interface DraftSeoExtras {
    slug?: string                   // URL-safe, ≤60 chars, derived from title
    metaDescription?: string         // 140-160 chars, includes primary keyword
    excerpt?: string                 // 40-80 word human-readable teaser
    primaryKeyword?: string          // main keyword this article targets
    secondaryKeywords?: string[]     // 3-5 related keywords
    categories?: string[]            // taxonomy labels (matched to WP cats by slug)
    tags?: string[]                  // up to 8 tags
    headings?: Array<{ level: 1 | 2 | 3; text: string }>   // extracted H1/H2/H3 structure
    schemaJsonLd?: Record<string, unknown>   // schema.org Article / BlogPosting JSON-LD
    faq?: Array<{ question: string; answer: string }>     // 3-5 Q&A pairs for AEO
}

async function generateDraftContent(
    apiKey: string,
    instanceId: string,
    item: PlanItem,
    ctx: GenContext,
): Promise<{ title: string; content: string; seo?: DraftSeoExtras } | null> {
    // Longer-form content types (blog/article/email) get SEO+AEO fields in the
    // JSON response. Shorter platforms (FB/IG/LI posts, reels) skip them.
    const wantsSeoExtras = item.channel === 'blog' || item.type === 'article'
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

## חוקים קריטיים — שפה

**100% עברית. אפס מילים באנגלית בגוף הטקסט.** זה חוק מוחלט — אם תכתבו אפילו מילה אחת באנגלית, הטיוטה נדחית אוטומטית.

### טרמינולוגיה — תרגום חובה
| במקום (אסור) | כתבו בעברית (חובה) |
|---|---|
| stack, tech stack | ערימת כלים / מערכת טכנולוגית |
| workflow | זרימת עבודה |
| AI | בינה מלאכותית |
| CTA | קריאה לפעולה |
| ROI | החזר השקעה |
| dashboard | לוח בקרה |
| automation | אוטומציה |
| feed | פיד (מותר) |
| performance | ביצועים |
| engagement | מעורבות |
| conversion | המרה |
| campaign | קמפיין (מותר) |
| audience | קהל |
| funnel | משפך |
| brief | מפרט / הנחיה |

### מה מותר להשאיר באנגלית (exceptions)
- שמות מוצרים רשמיים: ClawFlow, HubSpot, Facebook, Instagram (כשזה השם הרשמי)
- כתובות אתר ושמות חשבונות (example.com, @handle)
- מספרים ומטבעות: ₪, $, %
- כל השאר — חובה תרגום

## חוקים כלליים
- כתבו את **התוכן הסופי** — לא בריף, לא הסבר, לא מטא. זה מה שהולך ללוח הפלטפורמה.
- הקפידו על אורך מתאים לפלטפורמה (FB: 150-250 מילים, IG: 100-200, Blog: 800-1500, LinkedIn: 150-300, Email: 200-400)
- אם הפלטפורמה היא email או blog — החזירו גם כותרת בפורמט "title:" בשורה ראשונה

## תפוקה — JSON בלבד
${wantsSeoExtras ? `{
  "title": "<כותרת — 6-12 מילים, מכילה את המילה המרכזית, 100% עברית>",
  "content": "<התוכן המלא ב-markdown. חובה מבנה H2/H3. פתיחה + 4-6 מקטעים + מסקנה + קריאה לפעולה. 800-1500 מילים.>",
  "slug": "<slug URL-safe באנגלית או תעתיק לטיני של הכותרת, עד 60 תווים, מקפים במקום רווחים, אותיות קטנות בלבד. אם הכותרת בעברית — עשה תעתיק פשוט או תרגום קצר>",
  "metaDescription": "<140-160 תווים בעברית, כולל את המילה המרכזית פעם אחת, מפתה לקליק>",
  "excerpt": "<40-80 מילים בעברית — תקציר שמופיע ברשימות בלוג / social previews>",
  "primaryKeyword": "<המילה/ביטוי המרכזי שהמאמר ממקד (עברית)>",
  "secondaryKeywords": ["<3-5 ביטויים משניים>"],
  "categories": ["<1-3 קטגוריות בלוג רלוונטיות בעברית>"],
  "tags": ["<5-8 תגים בעברית>"],
  "headings": [
    { "level": 2, "text": "<כותרת H2 ראשונה>" },
    { "level": 3, "text": "<כותרת H3 תחתיה (אם יש)>" }
  ],
  "schemaJsonLd": {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "<אותה כותרת כמו title>",
    "description": "<אותו metaDescription>",
    "datePublished": "${item.date}",
    "inLanguage": "he-IL",
    "author": { "@type": "Organization", "name": "${ctx.businessName}" },
    "publisher": { "@type": "Organization", "name": "${ctx.businessName}" }
  },
  "faq": [
    { "question": "<שאלה טבעית שמשתמשים שואלים את ChatGPT/Gemini/Google>", "answer": "<תשובה 40-80 מילים, ישירה, כוללת את המילה המרכזית>" },
    { "question": "<שאלה 2>", "answer": "<תשובה 2>" },
    { "question": "<שאלה 3>", "answer": "<תשובה 3>" }
  ]
}

**חוקים ספציפיים ל-SEO/AEO:**
- \`content\` חייב להיות Markdown תקין עם H2 (## ) ו-H3 (### ) — לא HTML.
- \`slug\` — אותיות קטנות בלבד, רק a-z 0-9 ומקפים. בעברית → תעתיק לטיני פשוט.
- \`metaDescription\` — בדיוק 140-160 תווים. לא ארוך יותר.
- \`faq\` — 3 שאלות **טבעיות**, כמו שמשתמש היה מקליד ל-ChatGPT. לא מאולצות.
- \`primaryKeyword\` — ביטוי עברי 2-4 מילים שבני אדם באמת מחפשים.` : `{
  "title": "<כותרת הפריט — קצרה, 3-8 מילים, 100% עברית>",
  "content": "<התוכן המלא בעברית טהורה — מוכן לפרסום, כולל הוק פתיחה, גוף, קריאה לפעולה והאשטגים אם רלוונטי>"
}`}`

    try {
        // Resolve model per user's sub-agent config — content draft is
        // Yotzer's domain. User can upgrade to Opus in Settings → תת-סוכנים.
        const model = await resolveDirectModel(instanceId, 'yotzer')
        const isOpus = model.startsWith('claude-opus')
        const body: Record<string, unknown> = {
            model,
            // Article + SEO block needs more tokens (~800-1500 word article +
            // schema.org JSON + FAQ). Short posts use the smaller budget.
            max_tokens: wantsSeoExtras ? 6000 : 3000,
            messages: [{ role: 'user', content: prompt }],
        }
        if (isOpus) {
            body.thinking = { type: 'adaptive' }
            body.output_config = { effort: 'medium' }
        }
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(180000),
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
        const parsed = JSON.parse(raw) as {
            title?: string; content?: string
            slug?: string; metaDescription?: string; excerpt?: string
            primaryKeyword?: string; secondaryKeywords?: unknown
            categories?: unknown; tags?: unknown; headings?: unknown
            schemaJsonLd?: unknown; faq?: unknown
        }
        if (!parsed.content) return null

        // Harvest SEO extras (only present when wantsSeoExtras produced them).
        // Silently tolerate missing / malformed fields so legacy rows don't crash.
        const seo: DraftSeoExtras | undefined = wantsSeoExtras ? {
            slug: typeof parsed.slug === 'string' ? parsed.slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) : undefined,
            metaDescription: typeof parsed.metaDescription === 'string' ? parsed.metaDescription.trim().slice(0, 170) : undefined,
            excerpt: typeof parsed.excerpt === 'string' ? parsed.excerpt.trim() : undefined,
            primaryKeyword: typeof parsed.primaryKeyword === 'string' ? parsed.primaryKeyword.trim() : undefined,
            secondaryKeywords: Array.isArray(parsed.secondaryKeywords) ? parsed.secondaryKeywords.map(String).slice(0, 6) : undefined,
            categories: Array.isArray(parsed.categories) ? parsed.categories.map(String).slice(0, 3) : undefined,
            tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 8) : undefined,
            headings: Array.isArray(parsed.headings) ? (parsed.headings as any[]).filter(h => h && typeof h === 'object' && typeof h.text === 'string')
                .map(h => ({ level: (h.level === 1 || h.level === 3 ? h.level : 2) as 1 | 2 | 3, text: String(h.text) })).slice(0, 20) : undefined,
            schemaJsonLd: parsed.schemaJsonLd && typeof parsed.schemaJsonLd === 'object' ? parsed.schemaJsonLd as Record<string, unknown> : undefined,
            faq: Array.isArray(parsed.faq) ? (parsed.faq as any[]).filter(q => q && typeof q.question === 'string' && typeof q.answer === 'string')
                .map(q => ({ question: String(q.question), answer: String(q.answer) })).slice(0, 8) : undefined,
        } : undefined

        return {
            title: String(parsed.title || item.hook || 'תוכן חדש'),
            content: String(parsed.content),
            seo,
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

    // Phase 2.3.C — cron-style operation; default to primary mateh_agent
    const { resolvePrimaryAgent: __rp, readResearchData: __rrd } =
        await import('@/services/agentContext')
    const __planAgent = await __rp(instanceId)
    const rd = (await __rrd(__planAgent, instanceId)) as Record<string, unknown>
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

    // Which items are due? plan item date+time within the draft window.
    // Manual single-item trigger (opts.onlyItemId) bypasses the status /
    // due-window checks — user explicitly asked for this item to be drafted
    // RIGHT NOW, possibly replacing an earlier unsatisfactory draft.
    const dueItems: PlanItem[] = []
    for (const item of plan) {
        if (opts.onlyItemId && item.id !== opts.onlyItemId) continue
        if (!opts.onlyItemId && item.status !== 'planned') { skipped++; continue }
        const schedMs = new Date(`${item.date}T${item.time || '09:00'}:00+03:00`).getTime()
        const diff = schedMs - now.getTime()
        if (opts.onlyItemId || diff <= DUE_WINDOW_MS) {
            dueItems.push(item)
        }
    }
    if (dueItems.length === 0) return { drafted, skipped, failed }

    // Idempotency: skip items that already have an output with their id in
    // metadata. Skipped when onlyItemId is set — user explicitly asked to
    // re-draft, so we archive old outputs (see below) and regenerate.
    const existing = await db.select({ id: agentOutputs.id, metadata: agentOutputs.metadata })
        .from(agentOutputs)
        .where(eq(agentOutputs.instanceId, instanceId))
    const linkedMap = new Map<string, string[]>() // itemId → outputIds[]
    for (const o of existing) {
        const md = (o.metadata as Record<string, unknown> | null) || {}
        const itemId = md.contentPlanItemId ? String(md.contentPlanItemId) : null
        if (itemId) {
            const arr = linkedMap.get(itemId) || []
            arr.push(o.id)
            linkedMap.set(itemId, arr)
        }
    }

    const toProcess = opts.onlyItemId
        ? dueItems
        : dueItems.filter(it => !linkedMap.has(it.id)).slice(0, MAX_DRAFTS_PER_SWEEP)

    // On manual re-draft: archive any existing outputs linked to these items
    // so the user's approval queue shows the fresh draft, not both.
    if (opts.onlyItemId) {
        for (const item of toProcess) {
            const oldOutputs = linkedMap.get(item.id) || []
            for (const oid of oldOutputs) {
                try {
                    await db.update(agentOutputs)
                        .set({ status: 'archived', updatedAt: new Date() })
                        .where(eq(agentOutputs.id, oid))
                    console.log(`[planDraftRunner] archived old output ${oid} for item ${item.id}`)
                } catch { /* best effort */ }
            }
        }
    }

    for (const item of toProcess) {
        // Transition to drafting (immediate save to prevent race if cron fires again)
        item.status = 'drafting'
        {
            const { writeResearchData: __wrd } = await import('@/services/agentContext')
            await __wrd(__planAgent, instanceId, { ...rd, contentPlan: plan } as Record<string, unknown>)
        }

        const generated = await generateDraftContent(apiKey, instanceId, item, ctx)
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
            agentId: __planAgent?.id || null,
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
                // SEO/AEO extras for article / blog items — empty for short posts.
                // Consumed by GitHub + WordPress publishers to build frontmatter
                // + schema.org + featured media + Yoast meta.
                seo: generated.seo || undefined,
            },
            status: 'pending_review',
        })

        // Transition plan item to awaiting_review + link outputId
        item.status = 'awaiting_review' as PlanItem['status']
        ;(item as unknown as { outputId?: string }).outputId = outputId
        drafted.push(item.id)

        // Unified approval-queue Telegram — inline buttons + DB link + live
        // sync both ways. Replaces the older notifyDraftReady pattern.
        import('@/services/approvalQueueTelegram').then(m =>
            m.sendApprovalQueueMessage(outputId)
        ).catch(err => {
            console.warn(`[planDraftRunner] TG notify failed for ${item.id}:`, (err as Error).message)
        })

        // Phase M.1.4/M.1.6 — fire media generation in parallel with the
        // remaining drafts. We await the brief so Opus can decide the
        // visual direction first, but we don't block the whole sweep on
        // fal.ai + SFTP (~20-40s). Errors are logged; plan item still
        // goes to awaiting_review — user can manually regenerate media.
        // Skip for channels that don't need images (email, google_ads).
        const needsImage = !['email', 'google_ads', 'meta_ads', 'report'].includes(item.channel) &&
            !['campaign_launch', 'campaign_optimize', 'report'].includes(item.type)
        if (needsImage) {
            // Fire-and-forget: the media_renders row gets attached to this output
            // via metadata.contentPlanItemId; the Review UI joins the two.
            const { generateMediaForPlanItem } = await import('./mediaOrchestrator')
            generateMediaForPlanItem(instanceId, {
                id: item.id,
                hook: item.hook,
                brief: item.brief,
                pillar: item.pillar,
                persona: item.persona,
                channel: item.channel,
                type: item.type,
                productRef: item.productRef,
                ctaType: item.ctaType,
            }, { numVariantsPerChannel: 3 }).then(res => {
                if (res) {
                    console.log(`[planDraftRunner] ${item.id} media: ${res.renders.length} renders, $${res.totalCostUsd.toFixed(3)}`)
                } else {
                    console.warn(`[planDraftRunner] ${item.id} media generation returned null`)
                }
            }).catch(err => {
                console.warn(`[planDraftRunner] ${item.id} media generation error:`, (err as Error).message)
            })
        }
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
    let totalSkipped = 0
    const { isPipelineEnabled } = await import('./pipelineActivation')
    for (const row of live) {
        try {
            // Gate: only run for tenants where content_calendar pipeline is active.
            // Paid-only tenants (e.g. Google Ads HaaS clients) don't want
            // content drafts auto-generated.
            const enabled = await isPipelineEnabled(row.id, 'content_calendar')
            if (!enabled) { totalSkipped++; continue }
            // Phase 4.3-K: instance-readiness gate. Don't emit content_post /
            // blog_article drafts to משימות פעילות until contentPlan has been
            // approved by user. Otherwise users see drafts for items they
            // haven't yet committed to publishing.
            const { shouldEmitToReviewQueue } = await import('./instanceReadinessGate')
            const gate = await shouldEmitToReviewQueue(row.id, 'content_post')
            if (!gate.allow) {
                totalSkipped++
                console.log(`[planDraftRunner] ${row.id} skipped: ${gate.reason}`)
                continue
            }
            const res = await draftDuePlanItemsForInstance(row.id)
            totalDrafted += res.drafted.length
            totalFailed += res.failed.length
        } catch (err) {
            console.warn(`[planDraftRunner] ${row.id} sweep error:`, (err as Error).message)
            totalFailed++
        }
    }
    if (totalSkipped > 0) {
        console.log(`[planDraftRunner] skipped ${totalSkipped} tenant(s) — content_calendar pipeline disabled`)
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