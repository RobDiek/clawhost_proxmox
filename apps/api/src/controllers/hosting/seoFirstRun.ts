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

## פורמט תשובה
כתוב דוח מסודר עם כל הסעיפים. סמן עובדות כ-[VERIFIED] אם מקור 2+ או [SINGLE] אם מקור אחד.
אורך מינימלי: 3000 תווים. כתוב בעברית.`

        const b64Prompt = Buffer.from(researchPrompt).toString('base64')
        let researchResult = ''

        try {
            const sessionId = `seo-research-${Date.now()}`
            researchResult = await sshExec(instance.ip,
                `su - openclaw -c 'timeout 180 openclaw agent --agent sayer --session-id ${sessionId} -m "$(echo ${b64Prompt} | base64 -d)" 2>&1 | tail -200'`,
                instance.rootPassword || undefined,
                200000
            )
            console.log(`SEO research completed: ${researchResult.length} chars`)
        } catch (err) {
            console.error('SEO research failed:', err)
            researchResult = 'מחקר SEO נכשל — נסו שוב מאוחר יותר'
        }

        // Stage 2: Strategy (מנתח) — analyze research and build content plan
        const strategyPrompt = `בנה אסטרטגיית תוכן SEO על בסיס המחקר הבא.
מטרה: ${goalDesc}
עסק: ${businessName}
אתר: ${siteUrl}

## כלים זמינים (מותקנים ופעילים):
- dataforseo MCP — לאימות נתוני keywords אם צריך
- firecrawl MCP — לסריקת אתרים אם צריך
- brave-search MCP — לחיפוש מידע נוסף

## תוצאות המחקר:
${researchResult.slice(0, 4000)}

## בנה תוכנית:
1. רשימת 10 מאמרים/דפים מומלצים — מדורגים לפי ROI (traffic potential × feasibility)
2. לכל מאמר: כותרת מוצעת, keyword ראשי, intent, אורך מומלץ
3. 5 בעיות טכניות דחופות לתיקון
4. ציון AEO ראשוני: 1-100
5. 3 פעולות ראשונות שצריך לעשות השבוע

כתוב בעברית. תמציתי ואקשנאבילי.`

        const b64Strategy = Buffer.from(strategyPrompt).toString('base64')
        let strategyResult = ''

        try {
            const sessionId = `seo-strategy-${Date.now()}`
            strategyResult = await sshExec(instance.ip,
                `su - openclaw -c 'timeout 120 openclaw agent --agent menateach --session-id ${sessionId} -m "$(echo ${b64Strategy} | base64 -d)" 2>&1 | tail -150'`,
                instance.rootPassword || undefined,
                150000
            )
            console.log(`SEO strategy completed: ${strategyResult.length} chars`)
        } catch (err) {
            console.error('SEO strategy failed:', err)
            strategyResult = 'בניית אסטרטגיה נכשלה — נסו שוב'
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
