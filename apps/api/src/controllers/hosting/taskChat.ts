import type { Context } from 'hono'
import type { HonoEnv } from '@/ts/Types'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'
import { getApiKeyForInstance, resolveDirectModel, logApiUsage } from './agentSetup'

// ── POST /hosting/instances/:id/task-chat ──
// "שאלו AI" — a per-task assistant. The user opens a chat (sidebar) on a single
// monthly-plan task; the connected tenant model answers "how / why to do THIS
// task", grounded in the full task definition + relevant research_data + the
// connected stack. Scope v1: task + research context (no filesystem/tool access).
//
// Body: { taskId, messages: [{role:'user'|'assistant', content}], agentId? }
// Returns: { reply, model }
export const taskChat = async (c: Context<HonoEnv>) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        if (!(await getOwnedInstance(instanceId, userId))) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{
            taskId?: string
            messages?: Array<{ role?: string; content?: string }>
            agentId?: string
        }>().catch(() => ({} as Record<string, unknown>))

        const taskId = String((body as any).taskId || '').trim()
        const rawMsgs = Array.isArray((body as any).messages) ? (body as any).messages : []
        const messages = rawMsgs.filter((m: any) => m && typeof m.content === 'string' && m.content.trim())
        if (!taskId) return fail(c, 'taskId required', 400)
        if (!messages.length) return fail(c, 'messages required', 400)

        const { resolvePrimaryAgent, resolveAgentById, readResearchData } = await import('@/services/agentContext')
        const agentId = String((body as any).agentId || '').trim()
        const agent = agentId
            ? (await resolveAgentById(instanceId, agentId)) || (await resolvePrimaryAgent(instanceId))
            : await resolvePrimaryAgent(instanceId)

        const rd: any = await readResearchData(agent, instanceId)
        const plan = rd?.monthlyPlan
        const task = (plan?.tasks || []).find((t: any) => t.id === taskId)
        if (!task) return fail(c, 'Task not found in plan', 404)

        const apiKey = await getApiKeyForInstance(instanceId)
        if (!apiKey) return fail(c, 'מפתח API לא מוגדר עבור הסוכן', 400)
        const model = await resolveDirectModel(instanceId, 'menateach')

        let stack: any = null
        try {
            const { resolveConnectedStack } = await import('@/services/connectedStack')
            stack = await resolveConnectedStack(agent, instanceId)
        } catch { /* non-fatal */ }

        const system = buildSystemPrompt(rd, task, plan, stack)
        const apiMessages = messages.slice(-12).map((m: any) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: String(m.content).slice(0, 6000),
        }))
        // Anthropic requires the first message to be from the user.
        while (apiMessages.length && apiMessages[0].role !== 'user') apiMessages.shift()
        if (!apiMessages.length) return fail(c, 'messages required', 400)

        const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model, max_tokens: 1500, system, messages: apiMessages }),
            signal: AbortSignal.timeout(90000),
        })
        if (!apiRes.ok) {
            const errBody = await apiRes.text().catch(() => '')
            console.error(`[taskChat] Anthropic ${apiRes.status}:`, errBody.slice(0, 300))
            return fail(c, 'העוזר לא הצליח להשיב כרגע, נסו שוב', 502)
        }
        const data = await apiRes.json() as { content?: Array<{ text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } }
        const reply = (data.content?.[0]?.text || '').trim()
        if (data.usage) {
            logApiUsage({
                instanceId, purpose: 'task-chat', model,
                inputTokens: data.usage.input_tokens || 0, outputTokens: data.usage.output_tokens || 0,
            }).catch(() => { /* best-effort */ })
        }
        return ok(c, { reply, model })
    } catch (err) {
        console.error('taskChat error:', err)
        return fail(c, 'task-chat failed: ' + (err as Error).message, 500)
    }
}

function clip(s: unknown, n: number): string {
    if (s == null) return ''
    const str = typeof s === 'string' ? s : JSON.stringify(s)
    return str.length > n ? str.slice(0, n) + '…' : str
}

function buildSystemPrompt(rd: any, task: any, plan: any, stack: any): string {
    const businessName = rd?.answers?.businessName || rd?.businessName || 'העסק'
    const arche = rd?.archetypeStrategy
    const sources = Array.isArray(task.sources)
        ? task.sources.slice(0, 6).map((s: any) => `· ${clip(s.excerpt, 200)}`).join('\n')
        : ''
    const steps = Array.isArray(task.actionPlan)
        ? task.actionPlan.map((s: any, i: number) => `${i + 1}. ${clip(s.step, 200)}${s.automated ? ' [ניתן לאוטומציה]' : ' [ידני]'}`).join('\n')
        : ''
    const stackLine = stack
        ? `ערוץ פרסום: ${stack.publishChannel === 'github' ? `GitHub (${stack.githubRepo || ''})` : stack.publishChannel === 'wordpress' ? 'WordPress' : 'לא מחובר'}. `
            + `Google Ads: ${stack.googleAds ? 'מחובר' : 'לא מחובר'}. GTM: ${stack.gtm ? 'מחובר' : 'לא'}. GA4: ${stack.ga4 ? 'מחובר' : 'לא'}. Meta: ${stack.meta ? 'מחובר' : 'לא'}. GBP: ${stack.gbp ? 'מחובר' : 'לא'}.`
        : ''

    return `אתם עוזר/ת שיווק בכיר/ה ומנוסה של Flowmatic. תפקידכם: לעזור למשתמש להבין ולבצע משימה שיווקית ספציפית מהתוכנית החודשית שלו — להסביר איך ולמה, לתת צעדים קונקרטיים, ולענות על כל שאלה לגביה.

═══ כללי תשובה ═══
· תשובה בעברית בלבד, בגוף שני רבים (אתם/תוכלו/לכם). אנגלית רק לראשי-תיבות (GA4, CPA, SEO) ולשמות מוצר.
· תכל'ס וברור — בלי ז'רגון מיותר. הסבירו "למה זה חשוב" ו"איך עושים" בצעדים.
· אם המשימה ניתנת לביצוע אוטומטי דרך אינטגרציה מחוברת — אמרו זאת במפורש: "תוכלו פשוט ללחוץ 'אשרו' והמערכת תבצע את החלק האוטומטי; השלבים הידניים מסומנים".
· אל תמציאו נתונים. אם חסר מידע — אמרו זאת והציעו איך להשלים.
· קצר ועני לעניין — אלא אם המשתמש מבקש פירוט.

═══ הקשר העסק ═══
עסק: ${businessName}${arche ? ` · ארכיטיפ: ${clip(arche.archetypeNameHe, 60)}${arche.modifiers?.motion ? ` (${arche.modifiers.motion})` : ''}` : ''}
${stackLine}
נושא התוכנית החודשית: ${clip(plan?.overview?.keyTheme, 200)}

═══ המשימה הנוכחית ═══
כותרת: ${clip(task.title, 200)}
עדיפות: ${task.priority} · ערוץ: ${task.channel} · סוג: ${task.type}${task.scheduledFor ? ` · מתוכננת ל-${String(task.scheduledFor).slice(0, 10)}` : ''}
תקציר: ${clip(task.summary, 400)}
${task.expectedImpact ? `השפעה צפויה: ${clip(task.expectedImpact.metric, 40)}=${clip(task.expectedImpact.value, 20)} (${clip(task.expectedImpact.horizon, 10)}) — ${clip(task.expectedImpact.rationale, 250)}` : ''}
${sources ? `\nבסיס ראיות:\n${sources}` : ''}
${steps ? `\nתוכנית פעולה:\n${steps}` : ''}

ענו על השאלה של המשתמש לגבי המשימה הזו.`
}