/**
 * SEO First Run — Orchestrates the initial SEO research + strategy
 *
 * When all 3 SEO tools are connected (GSC + DataForSEO + Firecrawl),
 * this endpoint runs the full first research and builds a strategy.
 *
 * Steps:
 * 1. Validate all integrations are connected
 * 2. Run סייר (research) with SEO-specific prompt using MCP tools
 * 3. Run מאתר (audit) for technical site scan
 * 4. Run מנתח (strategy) to build content plan
 * 5. Save results as outputs (approval queue)
 * 6. Return summary
 */

import type { Context } from 'hono'
import { readFileSync } from 'fs'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances, agentOutputs } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { Client } from 'ssh2'
import { resolveUserId, getOwnedInstance } from './authHelper'
import crypto from 'crypto'

function generateId(): string { return crypto.randomBytes(6).toString('hex') }

/**
 * Extract clean text from openclaw agent --json output.
 *
 * OpenClaw agent --json returns:
 * {
 *   "result": {
 *     "payloads": [{"text": "step...", "mediaUrl": null}, ...],
 *     "finalAssistantVisibleText": "clean full report"
 *   }
 * }
 *
 * Strategy:
 * 1. Parse JSON → use finalAssistantVisibleText (best)
 * 2. If missing → concatenate payloads[].text, take the longest one (final report)
 * 3. Fallback → extract markdown from raw text
 * 4. Always: remove agent internal monologue
 */
function extractAgentText(raw: string): string {
    let text = ''

    // Try to find and parse the JSON object
    // OpenClaw agent --json outputs: {"runId":...,"result":{"payloads":[...],"finalAssistantVisibleText":"..."}}
    const jsonStart = raw.indexOf('{')
    const jsonEnd = raw.lastIndexOf('}')
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
        try {
            const jsonStr = raw.slice(jsonStart, jsonEnd + 1)
            console.log(`extractAgentText: JSON slice ${jsonStr.length} chars`)
            const parsed = JSON.parse(jsonStr)

            // Best: finalAssistantVisibleText
            const visible = parsed?.result?.finalAssistantVisibleText
            if (visible && typeof visible === 'string' && visible.length > 50) {
                console.log(`extractAgentText: found finalAssistantVisibleText (${visible.length} chars)`)
                text = visible
            }

            // Fallback: longest payload text
            if (!text || text.length < 50) {
                const payloads = parsed?.result?.payloads as Array<{ text?: string }> | undefined
                if (payloads && payloads.length > 0) {
                    let longest = ''
                    for (const p of payloads) {
                        if (p.text && p.text.length > longest.length) longest = p.text
                    }
                    if (longest.length > 50) {
                        console.log(`extractAgentText: using longest payload (${longest.length} chars)`)
                        text = longest
                    }
                }
            }
        } catch (err) {
            console.error(`extractAgentText: JSON parse failed:`, (err as Error).message?.slice(0, 100))
        }
    }

    // If JSON parsing failed, try to extract markdown from raw text
    if (!text || text.length < 100) {
        // Find the start of the actual report (first markdown heading)
        const headingMatch = raw.match(/^(#{1,3}\s.+)/m)
        if (headingMatch && headingMatch.index !== undefined) {
            text = raw.slice(headingMatch.index)
        } else {
            text = raw
        }
    }

    // Clean up
    text = cleanAgentOutput(text)
    return text
}

/**
 * Remove agent internal monologue, JSON fragments, and noise from output.
 */
function cleanAgentOutput(text: string): string {
    return text
        // Remove JSON fragment lines
        .replace(/^\s*"mediaUrl":\s*null\s*$/gm, '')
        .replace(/^\s*"text":\s*"/gm, '')
        .replace(/^\s*\},?\s*$/gm, '')
        .replace(/^\s*\{\s*$/gm, '')
        .replace(/^\s*\[\s*$/gm, '')
        .replace(/^\s*\]\s*$/gm, '')
        // Remove file listing / blockChars JSON fragments
        .replace(/\{"name":"[^"]+","blockChars":\d+\},?\n?/g, '')
        // Remove plugin/diagnostic log lines
        .replace(/\[plugins\].*\n?/g, '')
        .replace(/\[diagnostic\].*\n?/g, '')
        .replace(/\[model-fallback.*\n?/g, '')
        .replace(/Config warnings:.*\n?/g, '')
        // Remove agent internal thoughts (Hebrew patterns)
        .replace(/^.*?(טוב!|בואי נמשיך|עכשיו יש לי|בואי אני|נתחיל עם|אתחיל ב|מצוין!|יופי!|אוקיי|בסדר).*$/gm, '')
        // Remove "I'll use tool X" lines
        .replace(/^.*?(אשתמש ב|נשתמש ב|אריץ את|בודק את|מחפש ב|סורק את).*MCP.*$/gm, '')
        // Remove trailing + from psql-style output
        .replace(/\s*\+\s*$/gm, '')
        // Collapse multiple blank lines
        .replace(/\n{4,}/g, '\n\n\n')
        .trim()
}

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'

let sshKeyCache: Buffer | null = null
function getSSHKey(): Buffer {
    if (!sshKeyCache) sshKeyCache = readFileSync(SSH_KEY_PATH)
    return sshKeyCache
}

function sshExec(ip: string, command: string, password?: string, timeoutMs = 120000): Promise<string> {
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

// POST /instances/:id/seo/validate — check all integrations
export const seoValidate = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const gsc = instance.gscTokens as any
        const dfs = instance.dataforseoKey
        const fc = instance.firecrawlKey
        const siteUrl = gsc?.siteUrl || ''

        return ok(c, {
            gsc: { connected: !!gsc, siteUrl, sites: gsc?.sites || [], email: gsc?.email || '' },
            dataforseo: { connected: !!dfs, login: dfs ? dfs.split(':')[0] : '' },
            firecrawl: { connected: !!fc },
            allConnected: !!gsc && !!dfs && !!fc,
            businessProfile: (instance.researchData as any)?.answers || null,
        }, 'SEO validation')
    } catch (err) {
        console.error('seoValidate error:', err)
        return fail(c, 'Validation failed', 500)
    }
}

// POST /instances/:id/seo/first-run — run initial SEO research + strategy
export const seoFirstRun = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)
        if (!instance.ip) return fail(c, 'Instance not ready', 400)

        const body = await c.req.json<{
            goal: string         // 'traffic' | 'ai_visibility' | 'leads' | 'all'
            enableMonitoring: boolean
            siteUrl?: string
        }>()

        const gsc = instance.gscTokens as any
        const answers = (instance.researchData as any)?.answers || {}
        const siteUrl = body.siteUrl || gsc?.siteUrl || answers.website || ''
        const businessName = answers.businessName || 'העסק'
        const businessDesc = answers.businessDescription || ''
        const competitors = answers.competitors || ''
        const targetAudience = answers.targetAudience || ''

        const GOAL_MAP: Record<string, string> = {
            traffic: 'תנועה אורגנית מגוגל — מקסום כניסות',
            ai_visibility: 'נראות ב-AI — ציטוטים ב-ChatGPT, Perplexity, Claude',
            leads: 'לידים — תנועה שמתממרת ללקוחות',
            all: 'אסטרטגיה מקיפה — תנועה + AI + לידים',
        }
        const goalDesc = GOAL_MAP[body.goal] || GOAL_MAP.all

        console.log(`SEO First Run for ${instanceId}: goal=${body.goal}, site=${siteUrl}`)

        // Stage 1: Research (סייר) — uses DataForSEO + Firecrawl + Brave MCP
        const researchPrompt = `משימת מחקר SEO מקיפה לעסק "${businessName}".
אתר: ${siteUrl}
תחום: ${businessDesc}
${competitors ? `מתחרים: ${competitors}` : ''}
${targetAudience ? `קהל יעד: ${targetAudience}` : ''}
מטרה עיקרית: ${goalDesc}

## חשוב — כלי MCP מותקנים ומוכנים לשימוש:
הכלים הבאים מותקנים, מחוברים, ופעילים. השתמש בהם ישירות — הם עובדים:
1. **dataforseo** — MCP server מחובר. השתמש בו למחקר keywords, SERP analysis, competitor analysis, backlinks.
2. **firecrawl** — MCP server מחובר. השתמש בו לסריקת אתרים (scrape, crawl, map).
3. **brave-search** — MCP server מחובר. השתמש בו לחיפוש באינטרנט.
${gsc?.refreshToken ? '4. **gsc** — MCP server מחובר. השתמש בו לנתוני Google Search Console.' : ''}

אל תדלג על כלים. אל תגיד "לא מחובר". הם מותקנים — נסה להשתמש.

## שלב 1: מחקר מילות מפתח
השתמש ב-dataforseo MCP: keywords_for_site, keyword_suggestions, serp_analysis.
- חפש 20-30 מילות מפתח רלוונטיות לתחום
- לכל אחת: volume, difficulty, CPC, intent
- זהה gaps לעומת מתחרים

## שלב 2: ניתוח מתחרים
השתמש ב-firecrawl MCP: scrape + crawl על אתרי מתחרים.
השתמש ב-dataforseo MCP: competitor_analysis.
- סרוק 3-5 אתרי מתחרים
- מה התוכן שלהם? כמה דפים? מבנה?
- על מה הם מדורגים ואנחנו לא?

## שלב 3: ביקורת טכנית
השתמש ב-firecrawl MCP: crawl + map על ${siteUrl || 'האתר שלנו'}.
- קישורים שבורים? Schema חסר? בעיות מהירות?

## שלב 4: שאלות הקהל
השתמש ב-brave-search MCP: חפש שאלות בפורומים.
- מה אנשים שואלים על התחום שלנו?
- Reddit, פורומים, שאלות נפוצות

## פורמט תשובה — חשוב מאוד!
- כתוב דוח **נקי ומקצועי** — ללא תהליך חשיבה, ללא "בואי נמשיך", ללא "אשתמש בכלי X"
- הדוח הסופי בלבד. לא תיאור של מה עשית — רק התוצאות
- סמן עובדות כ-[VERIFIED] אם 2+ מקורות או [SINGLE] אם מקור אחד
- טבלאות עם נתונים אמיתיים מהכלים (volumes, difficulty, מחירים)
- אורך מינימלי: 3000 תווים. כתוב בעברית. Markdown format.`

        const b64Prompt = Buffer.from(researchPrompt).toString('base64')
        let researchResult = ''

        try {
            const sessionId = `seo-research-${Date.now()}`
            const rawOutput = await sshExec(instance.ip,
                `su - openclaw -c 'timeout 300 openclaw agent --session-id ${sessionId} --thinking medium -m "$(echo ${b64Prompt} | base64 -d)" --json 2>&1'`,
                instance.rootPassword || undefined,
                320000
            )
            researchResult = extractAgentText(rawOutput)
            console.log(`SEO research completed: ${researchResult.length} chars (raw: ${rawOutput.length})`)
        } catch (err) {
            console.error('SEO research failed:', err)
            researchResult = 'מחקר SEO נכשל — נסו שוב מאוחר יותר'
        }

        // Stage 2: Strategy (מנתח) — analyze research and build content plan
        // Pass the FULL research (up to 8000 chars), not just 4000
        const researchForStrategy = researchResult.slice(0, 8000)

        const strategyPrompt = `בנה אסטרטגיית תוכן לקידום אורגני על בסיס המחקר הבא.
מטרה: ${goalDesc}
עסק: ${businessName}
אתר: ${siteUrl}

## כלים זמינים (כבר מחוברים, אתה יכול להשתמש בהם ישירות):
- dataforseo — לאימות נפחי חיפוש ומילות מפתח
- firecrawl — לסריקת אתרי מתחרים
- brave-search — לחיפוש מידע נוסף

## תוצאות המחקר:
${researchForStrategy}

## קהל היעד של הדוח
בעל העסק עצמו — לא מומחה קידום. הוא רוצה להבין מה לעשות ולמה, בעברית פשוטה, בלי ז'רגון.

## כללי כתיבה (חובה!)
- **עברית פשוטה, לא ז'רגון.** כל מונח מקצועי חייב לבוא עם הסבר קצר בסוגריים:
  - "קושי המילה (Keyword Difficulty — עד כמה קשה להגיע למקום #1 בגוגל, 0-100)"
  - "כוונת החיפוש (Intent — מה האדם באמת רוצה כשהוא מקליד)"
  - "נפח חיפוש (Volume — כמה פעמים בחודש בישראל)"
  - "פוטנציאל תנועה (Traffic Potential — כמה גולשים צפויים להגיע בחודש)"
  - "היתכנות (Feasibility — עד כמה ריאלי להגיע לעמוד 1 עם המשאבים הקיימים)"
  - "ROI = Return On Investment = החזר על ההשקעה"
  - "AEO = Answer Engine Optimization = קידום בתשובות של AI (ChatGPT/Claude/Perplexity)"
- **בלי בליטות של אותיות לטיניות בטקסט זורם.** אם חייבים (למשל שם כלי) — כתוב בעברית עם הבהרה: "DataForSEO (כלי לנתוני מילות מפתח)".
- **בלי תהליך חשיבה.** אל תכתוב "בואו נראה", "אני אחפש". רק המסקנה.

## פורמט הדוח

### כותרת ופתיח קצר
התחל עם פסקת פתיח של 3-4 משפטים בעברית פשוטה: "מה מצאנו, מה זה אומר לעסק, מה צריך לעשות קודם."

### 1. תוכנית תוכן — 10 דפים מומלצים
**טבלה בדיוק בסדר הזה** (מעמודה ימין לשמאל — טבלה RTL בעברית):

| # | כותרת מוצעת | מילת מפתח ראשית | כוונת חיפוש | נפח חיפוש חודשי | קושי | פוטנציאל תנועה | היתכנות | דירוג ROI |
|---|---|---|---|---|---|---|---|---|
| 1 | ... | ... | מידעית / מסחרית / ניווטית | ~500 | בינוני (45) | ~120 גולשים/חודש | גבוהה | 🟢 מהיר |

**תחת הטבלה, לכל שורה 2-3 משפטים הסבר** למה דווקא זה: "הנושא הזה מתאים כי… בעל העסק יקבל… תוצאות תוך…".

### 2. 5 בעיות טכניות דחופות
לכל בעיה: **שם הבעיה בעברית פשוטה + מה המשמעות + מה לעשות**. למשל:
> **זמן טעינה איטי בנייד** — הדף נטען ב-6 שניות במקום 2. גוגל מעניש על זה בדירוגים, והגולשים נוטשים. **פעולה:** בקשו מהמתכנת לדחוס את התמונות ולהפעיל cache של הדפים.

### 3. ציון קידום בתשובות AI (AEO)
מספר 1-100 + הסבר קצר: "המשמעות: עד כמה הסיכוי שתופיעו בתשובה של ChatGPT/Claude/Perplexity כשמישהו שואל שאלה רלוונטית."

### 4. סיכום — 3 פעולות השבוע
3 משפטים קצרים, פרקטיים, בזמן פועל: "השבוע צריך ל…". כל אחד 15-25 מילים.

## דרישות כתיבה אחרונות
- מינימום 2500 תווים, בעברית בלבד
- הכל בתשובה עצמה — לא בקובץ, לא בלינק, לא הפניה חיצונית
- אם תמצא אבברויציה מקצועית שלא הוסברה ברשימה למעלה — הוסף הסבר מיד אחריה בסוגריים`

        const b64Strategy = Buffer.from(strategyPrompt).toString('base64')
        let strategyResult = ''

        try {
            const sessionId = `seo-strategy-${Date.now()}`
            const rawOutput = await sshExec(instance.ip,
                `su - openclaw -c 'timeout 300 openclaw agent --session-id ${sessionId} --thinking medium -m "$(echo ${b64Strategy} | base64 -d)" --json 2>&1'`,
                instance.rootPassword || undefined,
                320000
            )
            strategyResult = extractAgentText(rawOutput)
            console.log(`SEO strategy completed: ${strategyResult.length} chars (raw: ${rawOutput.length})`)
        } catch (err) {
            console.error('SEO strategy failed:', err)
            strategyResult = 'בניית אסטרטגיה נכשלה — נסו שוב'
        }

        // Fallback: if strategy is empty, use a summary request
        if (!strategyResult || strategyResult.length < 100) {
            console.log('Strategy was empty, trying fallback...')
            try {
                const fallbackPrompt = `סכם את המחקר הבא ובנה תוכנית תוכן SEO קצרה עם 5 מאמרים מומלצים:\n\n${researchForStrategy.slice(0, 3000)}\n\nכתוב בעברית. מינימום 1500 תווים.`
                const b64Fallback = Buffer.from(fallbackPrompt).toString('base64')
                const fbOutput = await sshExec(instance.ip,
                    `su - openclaw -c 'timeout 180 openclaw agent --session-id seo-fb-${Date.now()} -m "$(echo ${b64Fallback} | base64 -d)" --json 2>&1'`,
                    instance.rootPassword || undefined, 200000
                )
                strategyResult = extractAgentText(fbOutput)
                console.log(`Strategy fallback: ${strategyResult.length} chars`)
            } catch { /* give up */ }
        }

        // Save results as outputs (approval queue)
        const outputId1 = generateId()
        const outputId2 = generateId()

        // Research output
        await db.insert(agentOutputs).values({
            id: outputId1,
            instanceId,
            agentRole: 'sayer',
            outputType: 'weekly_report',
            title: 'מחקר SEO ראשון — ' + businessName,
            content: researchResult,
            status: 'published',
            metadata: { type: 'seo_research', goal: body.goal, siteUrl },
        }).catch(err => console.error('Failed to save research output:', err))

        // Strategy output
        await db.insert(agentOutputs).values({
            id: outputId2,
            instanceId,
            agentRole: 'menateach',
            outputType: 'weekly_report',
            title: 'אסטרטגיית SEO — ' + businessName,
            content: strategyResult,
            status: 'pending_review',
            metadata: { type: 'seo_strategy', goal: body.goal, siteUrl },
        }).catch(err => console.error('Failed to save strategy output:', err))

        // Enable monitoring if requested
        if (body.enableMonitoring) {
            const schedules = (instance.schedules as Record<string, unknown>) || {}
            schedules.seo = {
                gsc_daily_check: { enabled: true, time: '07:30', days: [0, 1, 2, 3, 4] },
                gsc_weekly_digest: { enabled: true, time: '09:00', weekday: 3 },
                aeo_deep_audit: { enabled: true, time: '10:00', monthday: 15 },
                tech_audit: { enabled: true, time: '10:00', monthday: 1 },
            }
            await db.update(instances)
                .set({ schedules: schedules as any })
                .where(eq(instances.id, instanceId))

            console.log(`SEO monitoring enabled for ${instanceId}`)
        }

        // Save SEO first-run metadata
        const currentResearch = (instance.researchData as Record<string, unknown>) || {}
        currentResearch.seoFirstRun = {
            completedAt: new Date().toISOString(),
            goal: body.goal,
            siteUrl,
            researchOutputId: outputId1,
            strategyOutputId: outputId2,
        }
        await db.update(instances)
            .set({ researchData: currentResearch as any })
            .where(eq(instances.id, instanceId))

        return ok(c, {
            researchId: outputId1,
            strategyId: outputId2,
            researchLength: researchResult.length,
            strategyLength: strategyResult.length,
            monitoring: body.enableMonitoring,
        }, 'SEO first run completed.')
    } catch (err) {
        console.error('seoFirstRun error:', err)
        return fail(c, 'SEO first run failed', 500)
    }
}

// GET /instances/:id/seo/status — check if first run was done
export const seoStatus = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const research = (instance.researchData as any) || {}
        const firstRun = research.seoFirstRun || null

        return ok(c, {
            firstRunCompleted: !!firstRun,
            firstRun,
            allConnected: !!(instance.gscTokens && instance.dataforseoKey && instance.firecrawlKey),
        }, 'SEO status')
    } catch (err) {
        console.error('seoStatus error:', err)
        return fail(c, 'Failed', 500)
    }
}