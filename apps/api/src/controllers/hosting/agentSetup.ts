import type { Context } from 'hono'
import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, join, relative } from 'path'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { Client } from 'ssh2'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'
const TEMPLATES_DIR = resolve(process.cwd(), '../../templates/mateh-system')

// Get API key for an instance: DB first, then env fallback
async function getApiKeyForInstance(instanceId: string): Promise<string> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (inst?.aiProviderKey) return inst.aiProviderKey
    return process.env.ANTHROPIC_API_KEY || ''
}

// ── SSH helper ──
function sshExec(ip: string, command: string, password?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        let output = ''
        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { conn.end(); return reject(err) }
                stream.on('data', (d: Buffer) => { output += d.toString() })
                stream.stderr.on('data', (d: Buffer) => { output += d.toString() })
                stream.on('close', () => { conn.end(); resolve(output.trim()) })
            })
        })
        .on('error', reject)

        const opts: Record<string, unknown> = { host: ip, port: 22, username: 'root' }
        if (password) opts.password = password
        try { opts.privateKey = readFileSync(SSH_KEY_PATH) } catch { /* key not available */ }
        conn.connect(opts)
    })
}

function sshWriteFile(ip: string, remotePath: string, content: string, password?: string): Promise<void> {
    return sshExec(ip, `mkdir -p "$(dirname '${remotePath}')" && cat > '${remotePath}' << 'CLAWEOF'\n${content}\nCLAWEOF`, password).then(() => {})
}

// ── Generate USER.md + BRAND.md via Claude ──
interface OnboardingAnswers {
    businessName: string
    businessDescription: string
    targetAudience: string
    competitors: string
    marketingGoals: string
    currentContent: string
    challenges: string
    websiteUrl?: string
    brandName?: string
    platforms?: string
    tone?: string
    budget?: string
    clarifications?: string
}

async function generateWithClaude(answers: OnboardingAnswers, apiKeyOverride?: string): Promise<{ userMd: string; brandMd: string }> {
    const key = apiKeyOverride || ANTHROPIC_API_KEY
    if (!key) {
        return generateFallback(answers)
    }

    const prompt = `אתה מומחה שיווק דיגיטלי ישראלי מנוסה. על סמך המידע הבא, צור שני קבצים מפורטים שישמשו כבסיס למערכת של 9 סוכני שיווק אוטונומיים.

מידע על העסק:
- שם העסק: ${answers.businessName}
- מה עושים: ${answers.businessDescription}
- אתר: ${answers.websiteUrl || 'לא צוין'}
- קהל יעד: ${answers.targetAudience}
- מתחרים: ${answers.competitors}
- מטרות שיווק: ${answers.marketingGoals}
- פלטפורמות פעילות: ${answers.platforms || 'לא צוין'}
- תוכן נוכחי: ${answers.currentContent}
- טון תקשורת: ${answers.tone || 'ידידותי ונגיש'}
- תקציב חודשי: ${answers.budget || 'לא צוין'}
- אתגרים: ${answers.challenges}${answers.clarifications ? `

מידע נוסף (תשובות לשאלות הבהרה):
${answers.clarifications}` : ''}

צור בדיוק שני קבצים:

===USER.MD===
קובץ USER.md מלא הכולל:
- פרטי העסק והתחום
- קהל יעד מפורט (דמוגרפיה, כאבים, מוטיבציות)
- מתחרים עם ניתוח קצר (מה הם עושים טוב/רע)
- מילות מפתח מומלצות (10-15 בעברית ובאנגלית)
- פלטפורמות מומלצות עם סדר עדיפויות
- KPIs מומלצים
- timezone: Asia/Jerusalem
- שפה: עברית, English

===BRAND.MD===
קובץ BRAND.md מלא הכולל:
- פוזיציונינג (positioning statement)
- קול ובטון (voice & tone) — בהתאם לטון שנבחר: ${answers.tone || 'ידידותי ונגיש'}
- 4-6 עמודי תוכן (content pillars) עם דוגמאות
- נושאים אסורים / רגישים
- CTAs מומלצים
- hashtags מומלצים (10-15)
- מבנה פוסט מומלץ לכל פלטפורמה
- תדירות פרסום מומלצת

כתוב בעברית טבעית וישראלית. היה ספציפי ואקשנאבילי — לא גנרי. כל המלצה צריכה להיות מותאמת לעסק הזה ספציפית.`

    console.log(`Calling Claude Sonnet for USER.md + BRAND.md (key: ${key.substring(0, 12)}...)`)

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 8192,
            messages: [{ role: 'user', content: prompt }],
        }),
    })

    if (!res.ok) {
        const errText = await res.text()
        console.error(`Claude API error ${res.status}:`, errText.substring(0, 300))
        return generateFallback(answers)
    }

    const data = await res.json() as { content?: Array<{ text: string }> }
    const text = data.content?.[0]?.text || ''

    console.log(`Claude response: ${text.length} chars`)

    if (!text || text.length < 100) {
        console.error('Claude returned empty or too short response')
        return generateFallback(answers)
    }

    // Flexible parsing: try multiple separator formats
    let userMdMatch: string | undefined
    let brandMdMatch: string | undefined

    // Try exact markers first
    for (const sep of ['===USER.MD===', '=== USER.MD ===', '## USER.MD', '# USER']) {
        const idx = text.indexOf(sep)
        if (idx !== -1) {
            const afterUser = text.substring(idx + sep.length)
            for (const brandSep of ['===BRAND.MD===', '=== BRAND.MD ===', '## BRAND.MD', '# BRAND']) {
                const brandIdx = afterUser.indexOf(brandSep)
                if (brandIdx !== -1) {
                    userMdMatch = afterUser.substring(0, brandIdx).trim()
                    brandMdMatch = afterUser.substring(brandIdx + brandSep.length).trim()
                    break
                }
            }
            if (userMdMatch) break
        }
    }

    // If no markers found, try splitting by "BRAND" keyword
    if (!userMdMatch && text.includes('BRAND')) {
        const parts = text.split(/#{1,3}\s*BRAND/)
        if (parts.length >= 2) {
            userMdMatch = parts[0].replace(/^#{1,3}\s*USER.*\n?/, '').trim()
            brandMdMatch = parts[1].trim()
        }
    }

    if (userMdMatch && userMdMatch.length > 50) {
        console.log(`Parsed: USER.md=${userMdMatch.length}c, BRAND.md=${(brandMdMatch || '').length}c`)
        return {
            userMd: userMdMatch,
            brandMd: brandMdMatch || generateFallback(answers).brandMd,
        }
    }

    console.error('Could not parse Claude response, using fallback. First 200 chars:', text.substring(0, 200))
    return generateFallback(answers)
}

function generateFallback(answers: OnboardingAnswers): { userMd: string; brandMd: string } {
    const userTemplate = readFileSync(join(TEMPLATES_DIR, 'workspace/USER.md.template'), 'utf-8')
    const brandTemplate = readFileSync(join(TEMPLATES_DIR, 'workspace/brands/BRAND.md.template'), 'utf-8')

    const userMd = userTemplate
        .replace(/\{\{BUSINESS_NAME\}\}/g, answers.businessName)
        .replace(/\{\{BUSINESS_DESCRIPTION\}\}/g, answers.businessDescription)
        .replace(/\{\{WEBSITE_URL\}\}/g, answers.websiteUrl || '')
        .replace(/\{\{TARGET_AUDIENCE\}\}/g, answers.targetAudience)
        .replace(/\{\{COMPETITORS\}\}/g, answers.competitors)
        .replace(/\{\{MARKETING_GOALS\}\}/g, answers.marketingGoals)
        .replace(/\{\{CURRENT_CONTENT\}\}/g, answers.currentContent)
        .replace(/\{\{CHALLENGES\}\}/g, answers.challenges)
        .replace(/\{\{KEYWORDS\}\}/g, '')
        .replace(/\{\{PLATFORMS\}\}/g, 'LinkedIn, Telegram, Blog')
        .replace(/\{\{LANGUAGES\}\}/g, 'עברית, English')

    const brandMd = brandTemplate
        .replace(/\{\{BRAND_NAME\}\}/g, answers.brandName || answers.businessName)
        .replace(/\{\{POSITIONING\}\}/g, `${answers.businessName} עוזר ל${answers.targetAudience} ב${answers.businessDescription}`)
        .replace(/\{\{DIFFERENTIATOR\}\}/g, '')
        .replace(/\{\{NEVER_SAY\}\}/g, '')
        .replace(/\{\{TONE\}\}/g, 'ישיר, מקצועי, ידידותי')
        .replace(/\{\{SENTENCE_STYLE\}\}/g, 'משפטים קצרים, פסקאות קצרות')
        .replace(/\{\{WORDS_WE_USE\}\}/g, '')
        .replace(/\{\{WORDS_WE_AVOID\}\}/g, 'בהחלט, מדהים, ללא ספק')
        .replace(/\{\{REFERENCE\}\}/g, 'מומחה בתחום')
        .replace(/\{\{AUDIENCE\}\}/g, answers.targetAudience)
        .replace(/\{\{PERSONA\}\}/g, answers.targetAudience)
        .replace(/\{\{OBJECTIONS\}\}/g, '')
        .replace(/\{\{TRIGGERS\}\}/g, '')
        .replace(/\{\{BEST_POST\}\}/g, 'טרם נכתב')
        .replace(/\{\{BEST_HOOK\}\}/g, 'טרם נכתב')
        .replace(/\{\{WORST_POST\}\}/g, 'טרם נכתב')
        .replace(/\{\{CONTENT_PILLARS\}\}/g, '')
        .replace(/\{\{CTA_LINKEDIN\}\}/g, '')
        .replace(/\{\{CTA_EMAIL\}\}/g, '')
        .replace(/\{\{CTA_TELEGRAM\}\}/g, '')

    return { userMd, brandMd }
}

// ── Deploy all files to VPS ──
async function deployAgentSystem(ip: string, userMd: string, brandMd: string, brandName: string, gatewayToken: string, subdomain: string, password?: string): Promise<void> {
    const baseDir = '/home/openclaw/.openclaw'

    // Create directory structure
    await sshExec(ip, `mkdir -p ${baseDir}/{workspace/brands/${brandName},workspace/memory,agents/{sayer,meater,maazin,menateach,et,yotzer,shaliach,migdalor}/output}`, password)

    // Deploy workspace files
    const workspaceFiles = ['SOUL.md', 'AGENTS.md', 'HEARTBEAT.md']
    for (const f of workspaceFiles) {
        const content = readFileSync(join(TEMPLATES_DIR, 'workspace', f), 'utf-8')
        await sshWriteFile(ip, `${baseDir}/workspace/${f}`, content, password)
    }

    // Deploy MEMORY.md
    const memoryContent = readFileSync(join(TEMPLATES_DIR, 'workspace/MEMORY.md.template'), 'utf-8')
    await sshWriteFile(ip, `${baseDir}/workspace/MEMORY.md`, memoryContent, password)

    // Deploy generated USER.md and BRAND.md
    await sshWriteFile(ip, `${baseDir}/workspace/USER.md`, userMd, password)
    await sshWriteFile(ip, `${baseDir}/workspace/brands/${brandName}/BRAND.md`, brandMd, password)

    // Deploy agent SOUL.md files
    const agents = ['sayer', 'meater', 'maazin', 'menateach', 'et', 'yotzer', 'shaliach', 'migdalor']
    for (const agent of agents) {
        const soulPath = join(TEMPLATES_DIR, 'agents', agent, 'SOUL.md')
        try {
            const content = readFileSync(soulPath, 'utf-8')
            await sshWriteFile(ip, `${baseDir}/agents/${agent}/SOUL.md`, content, password)
        } catch {
            console.error(`Missing template: ${soulPath}`)
        }
    }

    // Don't overwrite openclaw.json — it was already configured by cloud-init
    // with correct gateway token, auth settings, and device auth disabled.
    // Overwriting would break the running gateway configuration.

    // Fix permissions
    await sshExec(ip, `chown -R openclaw:openclaw ${baseDir}`, password)

    // Install skills
    await sshExec(ip, `
        cd /home/openclaw && su openclaw -c '
        clawhub install go-to-market 2>/dev/null;
        clawhub install marketing-strategy-pmm 2>/dev/null;
        clawhub install brave-search 2>/dev/null;
        clawhub install de-ai-ify 2>/dev/null;
        clawhub install image-gen 2>/dev/null;
        ' || true
    `, password)

    // Clean up: remove redundant files and clear session history to reduce token usage
    await sshExec(ip, `
        rm -f ${baseDir}/../BOOTSTRAP.md ${baseDir}/../TOOLS.md ${baseDir}/../IDENTITY.md 2>/dev/null;
        echo '{}' > /home/openclaw/.openclaw/agents/main/sessions/sessions.json 2>/dev/null;
        chown openclaw:openclaw /home/openclaw/.openclaw/agents/main/sessions/sessions.json 2>/dev/null
    `, password)

    // Restart OpenClaw
    await sshExec(ip, 'systemctl restart openclaw-gateway', password)

    // Wait for gateway to start
    await new Promise(r => setTimeout(r, 5000))

    // Ensure CLI device is paired (required for cron commands)
    // Trigger a connection attempt to create device identity + pending request
    await sshExec(ip, `su - openclaw -c 'openclaw config set gateway.port 3000 2>/dev/null; openclaw cron list 2>/dev/null || true' 2>&1`, password)
    await new Promise(r => setTimeout(r, 2000))

    // Read the pending request and approve it as paired
    await sshExec(ip, `
        su - openclaw -c '
        DEVICE_ID=$(node -e "try{const d=require(process.env.HOME+\\\"/.openclaw/identity/device.json\\\");console.log(d.deviceId)}catch(e){}" 2>/dev/null)
        PUB_KEY=$(node -e "try{const p=require(process.env.HOME+\\\"/.openclaw/devices/pending.json\\\");const k=Object.values(p)[0];if(k)console.log(k.publicKey)}catch(e){}" 2>/dev/null)

        if [ -n "$DEVICE_ID" ] && [ -n "$PUB_KEY" ]; then
            mkdir -p ~/.openclaw/devices
            cat > ~/.openclaw/devices/paired.json << EOFPAIR
{
  "$DEVICE_ID": {
    "deviceId": "$DEVICE_ID",
    "publicKey": "$PUB_KEY",
    "platform": "linux",
    "clientId": "cli",
    "clientMode": "cli",
    "role": "operator",
    "roles": ["operator"],
    "scopes": ["operator.admin","operator.read","operator.write","operator.approvals","operator.pairing"],
    "pairedAtMs": '$(date +%s000)',
    "label": "local-cli"
  }
}
EOFPAIR
            echo "{}" > ~/.openclaw/devices/pending.json
        fi
        '
    `, password)

    // Restart gateway to pick up pairing
    await sshExec(ip, 'systemctl restart openclaw-gateway', password)
    await new Promise(r => setTimeout(r, 4000))

    // Set up cron jobs (Daily Brief, Weekly Report, Monthly AEO)
    await sshExec(ip, `
        su - openclaw -c '
        openclaw cron add \
          --name "daily-brief" \
          --description "Daily Brief - marketing summary" \
          --cron "0 7 * * 0-4" \
          --tz "Asia/Jerusalem" \
          --model "claude-haiku-4-5-20251001" \
          --message "הכן Daily Brief: סכם פעילויות אתמול, 3 משימות עדיפות להיום, חדשות רלוונטיות. הודעה קצרה ותכליתית." \
          --session isolated 2>/dev/null;

        openclaw cron add \
          --name "weekly-competitive" \
          --description "Weekly Competitive Report" \
          --cron "0 8 * * 1" \
          --tz "Asia/Jerusalem" \
          --model "claude-sonnet-4-6" \
          --message "דוח תחרותי שבועי: סייר חפש מתחרים, מאזין בדוק שיחות, מנתח דרג הזדמנויות, עט כתוב 2-3 הצעות פוסטים." \
          --session isolated 2>/dev/null;

        openclaw cron add \
          --name "monthly-aeo" \
          --description "Monthly AEO Audit" \
          --cron "0 10 1 * *" \
          --tz "Asia/Jerusalem" \
          --model "claude-sonnet-4-6" \
          --message "ביקורת AEO חודשית: בדוק ציטוטים ב-Claude/ChatGPT/Perplexity, Schema tags, המלצות לשיפור." \
          --session isolated 2>/dev/null;
        '
    `, password)
}

// ── POST /hosting/instances/:id/setup/agents/analyze ──
// Step 1: Claude analyzes questionnaire and suggests clarifying questions
export const analyzeAnswers = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const answers = await c.req.json<OnboardingAnswers>()

        if (!answers.businessName || !answers.businessDescription) {
            return fail(c, 'Business name and description are required.', 400)
        }

        // Get user's API key from DB
        const apiKey = await getApiKeyForInstance(instanceId)

        if (!apiKey) {
            // No API key — skip clarifying questions
            return ok(c, { questions: [], ready: true }, 'No clarifying questions needed.')
        }

        const prompt = `אתה ראש צוות שיווק דיגיטלי ישראלי מנוסה. אתה מכין תשתית למערכת של 9 סוכני AI שיווקיים שיעבדו אוטונומית עבור העסק.

הצוות שלך כולל:
- סייר: מחקר מתחרים באינטרנט (צריך URLs ו-USP ברור)
- מאתר: מחקר SERP ומילות מפתח (צריך לדעת מה הלקוח מחפש)
- מאזין: ניטור שיחות ברשתות (צריך לדעת איפה הקהל "תקוע")
- מנתח: ניתוח הזדמנויות (צריך להבין מחזור מכירה ו-unit economics)
- עט: כתיבה (צריך voice & tone + דוגמאות)
- שליח: הפצה (צריך לדעת לאילו פלטפורמות ובאיזו תדירות)

נתוני העסק:
- שם: ${answers.businessName}
- תחום: ${answers.businessDescription}
- אתר: ${answers.websiteUrl || 'לא צוין'}
- קהל יעד: ${answers.targetAudience || 'לא צוין'}
- מתחרים: ${answers.competitors || 'לא צוין'}
- מטרות: ${answers.marketingGoals || 'לא צוין'}
- פלטפורמות: ${answers.platforms || 'לא צוין'}
- תוכן נוכחי: ${answers.currentContent || 'לא צוין'}
- טון: ${answers.tone || 'לא צוין'}
- תקציב: ${answers.budget || 'לא צוין'}
- אתגרים: ${answers.challenges || 'לא צוין'}

המשימה: נתח את הנתונים מנקודת המבט של הסוכנים. זהה מה חסר להם כדי להתחיל לעבוד אוטונומית. שאל 2-3 שאלות שימלאו את הפערים הקריטיים ביותר.

החזר JSON בלבד:
{
  "assessment": "הערכה קצרה — מה ברור ומה חסר",
  "questions": [
    { "id": "q1", "question": "השאלה בעברית", "placeholder": "דוגמה לתשובה מועילה", "type": "text", "why": "הסבר קצר למה זה חשוב" }
  ]
}

כללים:
- מקסימום 3 שאלות — רק מה שבאמת קריטי לסוכנים
- אם המידע מספיק — החזר questions ריק
- תעדוף: (1) URLs של מתחרים (2) USP/יתרון תחרותי (3) מחזור מכירה ומחיר (4) איפה הלקוחות "תקועים" אונליין (5) האם הבעלים personal brand
- אל תשאל על מה שכבר ברור מהתשובות
- כל שאלה חייבת why שמסביר למה הסוכנים צריכים את זה`

        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 1000,
                messages: [{ role: 'user', content: prompt }],
            }),
        })

        const data = await res.json() as { content?: Array<{ text: string }> }
        const text = data.content?.[0]?.text || '{}'

        // Extract JSON from response — robust parsing
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
            let jsonStr = jsonMatch[0]
            // Fix common Claude JSON issues: trailing commas, comments
            jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1')  // trailing commas
            jsonStr = jsonStr.replace(/\/\/[^\n]*/g, '')       // line comments

            try {
                const parsed = JSON.parse(jsonStr)
                return ok(c, {
                    assessment: parsed.assessment || '',
                    questions: parsed.questions || [],
                    ready: !parsed.questions || parsed.questions.length === 0,
                }, 'Analysis complete.')
            } catch (parseErr) {
                // JSON still invalid — try to extract questions manually
                console.error('JSON parse failed, extracting manually:', parseErr)
                const assessment = (text.match(/"assessment"\s*:\s*"([^"]*)"/) || [])[1] || ''
                const questionMatches = text.match(/"question"\s*:\s*"([^"]*)"/g) || []
                const questions = questionMatches.slice(0, 3).map((m, i) => ({
                    id: 'q' + (i + 1),
                    question: (m.match(/"question"\s*:\s*"([^"]*)"/) || [])[1] || '',
                    placeholder: '',
                    type: 'text',
                })).filter(q => q.question)

                if (questions.length > 0) {
                    return ok(c, { assessment, questions, ready: false }, 'Analysis complete (recovered).')
                }
            }
        }

        return ok(c, { questions: [], ready: true }, 'No clarifying questions needed.')
    } catch (err) {
        console.error('analyzeAnswers error:', err)
        // On error, skip clarifying questions and proceed
        return ok(c, { questions: [], ready: true }, 'Analysis skipped.')
    }
}

// ── POST /hosting/instances/:id/setup/agents/research ──
// Runs research via the live agent on VPS (with web search + browser access)
export const runResearch = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))

        if (!instance?.ip) {
            return fail(c, 'Instance not found or not ready.', 404)
        }

        // Read current business context from researchData
        const answers = (instance.researchData as any)?.answers || {}
        const businessName = answers.businessName || 'העסק'
        const businessDesc = answers.businessDescription || ''
        const competitors = answers.competitors || ''
        const targetAudience = answers.targetAudience || ''

        console.log(`Running VPS research for ${businessName} on ${instance.ip}...`)

        // Build research prompt for the live agent
        const researchPrompt = `זוהי משימת מחקר חדשה. תתעלם ממחקרים קודמים — עשה מחקר מעודכן מאפס.

עשה מחקר שוק מקיף עבור ${businessName}.
התחום: ${businessDesc}.
${competitors ? `מתחרים שצוינו: ${competitors}.` : ''}
${targetAudience ? `קהל יעד: ${targetAudience}.` : ''}

חפש באינטרנט ותן דוח מלא. הדוח חייב להיות כאן בתשובה — לא בקובץ נפרד:
1. 3-5 מתחרים ישירים (שם, URL, מה עושים טוב/חלש)
2. 10 מילות מפתח רלוונטיות (עברית + אנגלית)
3. 2-3 פרסונות קהל יעד
4. הזדמנויות תוכן
5. המלצות אסטרטגיות
6. הנחיות ספציפיות לכל אחד מ-9 הסוכנים

אל תשלח לטלגרם. אל תשמור לקובץ. כתוב את הדוח המלא כאן בתשובה. בעברית.`

        // Escape for shell — use base64 to avoid quoting issues
        const b64Prompt = Buffer.from(researchPrompt).toString('base64')

        // Run via openclaw agent on VPS with unique session ID to avoid cache
        const sessionId = `research-${Date.now()}`
        const output = await sshExec(instance.ip,
            `su - openclaw -c 'timeout 180 openclaw agent --agent main --session-id ${sessionId} -m "$(echo ${b64Prompt} | base64 -d)" --json 2>&1'`,
            instance.rootPassword || undefined
        )

        // Parse agent response
        let report = ''
        try {
            const agentResult = JSON.parse(output)
            report = agentResult?.result?.payloads?.[0]?.text || ''
        } catch {
            // If not JSON, use raw output (might be text response)
            report = output
        }

        if (!report || report.length < 100) {
            console.error('Research returned too short:', report.substring(0, 200))
            return fail(c, 'המחקר לא הצליח — נסו שוב', 500)
        }

        // Save report to DB
        const existingData = (instance.researchData as any) || {}
        await db.update(instances).set({
            researchData: {
                ...existingData,
                report,
                researchGeneratedAt: new Date().toISOString(),
            } as any,
        }).where(eq(instances.id, instanceId))

        // Also save as RESEARCH_REPORT.md on VPS
        await sshExec(instance.ip,
            `cat > /home/openclaw/.openclaw/workspace/RESEARCH_REPORT.md << 'EOFREPORT'\n${report}\nEOFREPORT\nchown openclaw:openclaw /home/openclaw/.openclaw/workspace/RESEARCH_REPORT.md`,
            instance.rootPassword || undefined
        )

        console.log(`Research complete for ${businessName} (${report.length} chars)`)
        return ok(c, { report }, 'Research complete.')
    } catch (err) {
        console.error('runResearch error:', err)
        return fail(c, 'Research failed.', 500)
    }
}

// ── POST /hosting/instances/:id/setup/agents ──
export const setupAgents = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const answers = await c.req.json<OnboardingAnswers>()

        if (!answers.businessName || !answers.businessDescription) {
            return fail(c, 'Business name and description are required.', 400)
        }

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) {
            return fail(c, 'Instance not found or not ready.', 404)
        }

        // Get user's API key from DB
        const apiKey = await getApiKeyForInstance(instanceId)

        // Generate personalized files
        console.log(`Generating USER.md + BRAND.md for ${answers.businessName}...`)
        const { userMd, brandMd } = await generateWithClaude(answers, apiKey)

        // Deploy to VPS
        const brandSlug = (answers.brandName || answers.businessName).toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')
        const gatewayToken = instance.openclawToken || ''
        const subdomain = instance.subdomainName || instanceId

        console.log(`Deploying agent system to ${instance.ip}...`)
        await deployAgentSystem(instance.ip, userMd, brandMd, brandSlug, gatewayToken, subdomain, instance.rootPassword || undefined)

        // Update DB
        await db.update(instances).set({
            onboardingStep: 3,
            researchData: { answers, generatedAt: new Date().toISOString() } as any,
        }).where(eq(instances.id, instanceId))

        return ok(c, {
            userMd: userMd.substring(0, 200) + '...',
            brandMd: brandMd.substring(0, 200) + '...',
            skillsInstalled: true,
        }, 'Agent system deployed.')
    } catch (err) {
        console.error('setupAgents error:', err)
        return fail(c, 'Failed to setup agents.', 500)
    }
}
