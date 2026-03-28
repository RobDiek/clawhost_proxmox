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

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-5-20250514',
            max_tokens: 4000,
            messages: [{ role: 'user', content: prompt }],
        }),
    })

    const data = await res.json() as { content?: Array<{ text: string }> }
    const text = data.content?.[0]?.text || ''

    const userMdMatch = text.split('===USER.MD===')[1]?.split('===BRAND.MD===')[0]?.trim()
    const brandMdMatch = text.split('===BRAND.MD===')[1]?.trim()

    return {
        userMd: userMdMatch || generateFallback(answers).userMd,
        brandMd: brandMdMatch || generateFallback(answers).brandMd,
    }
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
          --model "claude-sonnet-4-5-20250514" \
          --message "דוח תחרותי שבועי: סייר חפש מתחרים, מאזין בדוק שיחות, מנתח דרג הזדמנויות, עט כתוב 2-3 הצעות פוסטים." \
          --session isolated 2>/dev/null;

        openclaw cron add \
          --name "monthly-aeo" \
          --description "Monthly AEO Audit" \
          --cron "0 10 1 * *" \
          --tz "Asia/Jerusalem" \
          --model "claude-sonnet-4-5-20250514" \
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
// Deep research: analyzes business, competitors, market. Self-searches when data is missing.
export const runResearch = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const body = await c.req.json<OnboardingAnswers & { clarifications?: string }>()

        if (!body.businessName) {
            return fail(c, 'Business name is required.', 400)
        }

        // Get user's API key from DB
        const apiKey = await getApiKeyForInstance(instanceId)

        if (!apiKey) {
            return fail(c, 'מפתח API לא מוגדר — הגדירו Anthropic API Key באינטגרציות', 400)
        }

        console.log(`Running research for ${body.businessName}...`)

        const prompt = `אתה ראש מחלקת מחקר שיווק. אתה מכין דוח מחקר מקיף שישמש כבסיס ל-9 סוכני שיווק אוטונומיים.

## נתוני העסק
- שם: ${body.businessName}
- תחום: ${body.businessDescription}
- אתר: ${body.websiteUrl || 'לא צוין — חפש באינטרנט לפי שם העסק'}
- קהל יעד: ${body.targetAudience || 'לא צוין — הסק מהתחום'}
- מתחרים: ${body.competitors || 'לא צוין — חפש מתחרים בתחום בישראל'}
- מטרות: ${body.marketingGoals || 'לא צוין — הצע מטרות רלוונטיות'}
- פלטפורמות: ${body.platforms || 'לא צוין — המלץ על סמך קהל היעד'}
- תוכן נוכחי: ${body.currentContent || 'לא מפרסמים עדיין'}
- טון: ${body.tone || 'ידידותי ונגיש'}
- תקציב: ${body.budget || 'לא צוין'}
- אתגרים: ${body.challenges || 'לא צוין'}
${body.clarifications ? `\n## מידע נוסף מהמשתמש\n${body.clarifications}` : ''}

## המשימה שלך
צור דוח מחקר מלא בעברית. כשמידע חסר — **הסק, נתח, והצע** על סמך הידע שלך בתחום, לא תשאל עוד שאלות.

## מבנה הדוח (הכרחי):

### 1. סיכום מנהלים
משפט אחד: מה העסק, מה ההזדמנות, מה המוקד.

### 2. ניתוח שוק ומתחרים
- 3-5 מתחרים ישירים (שם, URL אם ידוע, מה הם עושים טוב, מה חלש)
- גודל שוק משוער
- מגמות בתחום

### 3. קהל יעד מפורט
- 2-3 פרסונות (שם, גיל, תפקיד, כאבים, מוטיבציות, איפה נמצאים אונליין)
- שאלות שהקהל שואל (לפחות 5)
- מילות מפתח שהקהל מחפש (10-15, עברית + אנגלית)

### 4. אסטרטגיה מוצעת
- פוזיציונינג (positioning statement)
- USP (מה מבדיל)
- 4-6 עמודי תוכן (content pillars) עם דוגמאות
- מסלול המרה: awareness → consideration → conversion

### 5. תוכנית פעולה (טקטיקה)
- פלטפורמות מומלצות לפי סדר עדיפויות + תדירות פרסום
- סוגי תוכן לכל פלטפורמה
- לוח זמנים שבועי מוצע
- KPIs מומלצים (3-5 מדדים)

### 6. תקציב והקצאה
- חלוקת תקציב מומלצת (אורגני vs ממומן)
- ROI צפוי

### 7. הנחיות ל-9 סוכנים
לכל סוכן — משפט אחד שמגדיר את המוקד שלו לעסק הזה:
- מטה: [מה מתאם]
- סייר: [מה חוקר]
- מאתר: [אילו מילות מפתח]
- מאזין: [מה מנטר]
- מנתח: [מה מנתח]
- עט: [איזה תוכן כותב]
- יוצר: [איזה ויזואלים]
- שליח: [לאן מפיץ]
- מגדלור: [מה בודק]

כתוב בעברית ישראלית טבעית. היה ספציפי — לא גנרי. כל המלצה מותאמת לעסק הזה.`

        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-5-20250514',
                max_tokens: 8000,
                messages: [{ role: 'user', content: prompt }],
            }),
        })

        const data = await res.json() as { content?: Array<{ text: string }> }
        const report = data.content?.[0]?.text || ''

        // Save research to DB
        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (instance) {
            await db.update(instances).set({
                researchData: {
                    answers: body,
                    report,
                    generatedAt: new Date().toISOString(),
                } as any,
            }).where(eq(instances.id, instanceId))
        }

        console.log(`Research complete for ${body.businessName} (${report.length} chars)`)
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
