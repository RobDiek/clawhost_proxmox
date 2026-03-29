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

כתוב בעברית טבעית וישראלית. היה ספציפי ואקשנאבילי — לא גנרי.

חשוב מאוד — מגבלות גודל:
- USER.md: מקסימום 1,500 תווים. תמציתי — רק מידע שמשפיע על החלטות
- BRAND.md: מקסימום 4,000 תווים. עמודי תוכן + טון + CTAs — בלי דוגמאות ארוכות
אלו קבצי system prompt שנטענים בכל בקשה. כל תו עולה כסף.`

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

    // Register sub-agents with specific models (for research, strategy, content)
    await sshExec(ip, `
        su - openclaw -c '
        AGENTS=$(openclaw agents list --json 2>/dev/null | node -e "try{const d=JSON.parse(require(\"fs\").readFileSync(\"/dev/stdin\",\"utf-8\"));console.log(d.map(a=>a.name).join(\",\"))}catch(e){}" 2>/dev/null)

        if ! echo "$AGENTS" | grep -q "sayer"; then
          openclaw agents add sayer --model "anthropic/claude-opus-4-6" --workspace ~/.openclaw/workspace --agent-dir ~/.openclaw/agents/sayer --non-interactive 2>/dev/null
        fi
        if ! echo "$AGENTS" | grep -q "menateach"; then
          openclaw agents add menateach --model "anthropic/claude-opus-4-6" --workspace ~/.openclaw/workspace --agent-dir ~/.openclaw/agents/menateach --non-interactive 2>/dev/null
        fi
        if ! echo "$AGENTS" | grep -q "et"; then
          openclaw agents add et --model "anthropic/claude-sonnet-4-6" --workspace ~/.openclaw/workspace --agent-dir ~/.openclaw/agents/et --non-interactive 2>/dev/null
        fi
        '
    `, password)

    // Restart to pick up new agents
    await sshExec(ip, 'systemctl restart openclaw-gateway', password)
    await new Promise(r => setTimeout(r, 3000))

    // Set up cron jobs — only if they don't exist yet (prevent duplicates)
    await sshExec(ip, `
        su - openclaw -c '
        EXISTING=$(openclaw cron list --json 2>/dev/null | node -e "try{const d=JSON.parse(require(\"fs\").readFileSync(\"/dev/stdin\",\"utf-8\"));console.log(d.jobs.map(j=>j.name).join(\",\"))}catch(e){}" 2>/dev/null)

        if ! echo "$EXISTING" | grep -q "daily-brief"; then
          openclaw cron add \
            --name "daily-brief" \
            --description "Daily Brief - marketing summary" \
            --cron "0 7 * * 0-4" \
            --tz "Asia/Jerusalem" \
            --message "הכן Daily Brief: סכם פעילויות אתמול, 3 משימות עדיפות להיום, חדשות רלוונטיות. הודעה קצרה ותכליתית." \
            --session isolated 2>/dev/null
        fi

        if ! echo "$EXISTING" | grep -q "weekly-competitive"; then
          openclaw cron add \
            --name "weekly-competitive" \
            --description "Weekly Competitive Report" \
            --cron "0 8 * * 1" \
            --tz "Asia/Jerusalem" \
            --message "דוח תחרותי שבועי: סייר חפש מתחרים, מאזין בדוק שיחות, מנתח דרג הזדמנויות, עט כתוב 2-3 הצעות פוסטים." \
            --session isolated 2>/dev/null
        fi

        if ! echo "$EXISTING" | grep -q "monthly-aeo"; then
          openclaw cron add \
            --name "monthly-aeo" \
          --description "Monthly AEO Audit" \
          --cron "0 10 1 * *" \
          --tz "Asia/Jerusalem" \
          --message "ביקורת AEO חודשית: בדוק ציטוטים ב-Claude/ChatGPT/Perplexity, Schema tags, המלצות לשיפור." \
          --session isolated 2>/dev/null
        fi
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

// ── Helper: get model for a specific sub-agent role ──
// Reads from DB (sub_agent_models) first, falls back to defaults
const DEFAULT_ROLE_MODELS: Record<string, string> = {
    'mateh': 'anthropic/claude-opus-4-6',
    'sayer': 'anthropic/claude-opus-4-6',
    'meater': 'anthropic/claude-sonnet-4-6',
    'maazin': 'anthropic/claude-sonnet-4-6',
    'menateach': 'anthropic/claude-opus-4-6',
    'et': 'anthropic/claude-sonnet-4-6',
    'yotzer': 'anthropic/claude-sonnet-4-6',
    'shaliach': 'anthropic/claude-haiku-4-5-20251001',
    'migdalor': 'anthropic/claude-sonnet-4-6',
}

async function getSubAgentModel(instanceId: string, role: string): Promise<string> {
    // Try to read from DB (user's custom config from dashboard)
    try {
        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        const customModels = (inst?.subAgentModels as Record<string, string>) || {}
        if (customModels[role]) return customModels[role]
    } catch { /* fallback */ }
    return DEFAULT_ROLE_MODELS[role] || 'openai/gpt-4o'
}

// ── Helper: validate research report quality ──
function validateResearchReport(report: string): { valid: boolean; reason?: string } {
    if (!report || report.length < 2000) {
        return { valid: false, reason: `too_short (${report?.length || 0} chars, need 2000+)` }
    }
    // Check for cached/lazy response
    if (report.includes('כבר מוכן') || report.includes('already done') || report.includes('הרצתי אותו')) {
        return { valid: false, reason: 'cached_response' }
    }
    // Check for required sections (at least 3 of 6)
    const sections = ['מתחרים', 'מילות מפתח', 'פרסונ', 'הזדמנויות', 'אסטרטגי', 'סוכנים']
    const found = sections.filter(s => report.includes(s)).length
    if (found < 3) {
        return { valid: false, reason: `missing_sections (found ${found}/6)` }
    }
    return { valid: true }
}

// ── POST /hosting/instances/:id/setup/agents/research ──
// Runs research via the live agent on VPS with proper model + validation
export const runResearch = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))

        if (!instance?.ip) {
            return fail(c, 'Instance not found or not ready.', 404)
        }

        const answers = (instance.researchData as any)?.answers || {}
        const businessName = answers.businessName || 'העסק'
        const businessDesc = answers.businessDescription || ''
        const competitors = answers.competitors || ''
        const targetAudience = answers.targetAudience || ''
        const platforms = answers.platforms || ''
        const tone = answers.tone || ''

        // Get the model for סייר (researcher) — should be Opus
        const researchModel = await getSubAgentModel(instanceId, 'sayer')
        console.log(`Running research for ${businessName} with model ${researchModel}...`)

        const researchPrompt = `זוהי משימת מחקר חדשה לחלוטין. אל תשתמש במידע קודם — חפש הכל מחדש.

עשה מחקר שוק מקיף עבור "${businessName}".
תחום: ${businessDesc}
${competitors ? `מתחרים ידועים: ${competitors}` : ''}
${targetAudience ? `קהל יעד: ${targetAudience}` : ''}
${platforms ? `פלטפורמות: ${platforms}` : ''}

חפש באינטרנט (השתמש ב-web search) ותן דוח מלא. חובה לכלול את כל 6 הסעיפים:

## מתחרים ישירים
3-5 מתחרים. לכל אחד: שם, URL, מה עושים טוב, מה חלש, רמת איום.

## מילות מפתח
10-15 מילות מפתח (עברית + אנגלית). לכל אחת: כוונה (מסחרית/מידעית), תחרות, עדיפות.

## פרסונות קהל יעד
2-3 פרסונות מפורטות: שם, גיל, תפקיד, כאבים, מוטיבציות, רשתות, טריגרים.

## הזדמנויות תוכן
5 הזדמנויות ספציפיות עם ציון עדיפות.

## המלצות אסטרטגיות
5 המלצות אקשנאביליות עם timeline.

## הנחיות ל-9 סוכנים
לכל סוכן 1-2 משפטים: מטה, סייר, מאתר, מאזין, מנתח, עט, יוצר, שליח, מגדלור.

חובה: כתוב בעברית. הדוח חייב להיות כאן בתשובה — לא בקובץ נפרד. אל תשלח לטלגרם.
אורך מינימלי: 3000 תווים.`

        const b64Prompt = Buffer.from(researchPrompt).toString('base64')

        // Retry loop: up to 2 attempts
        let report = ''
        let lastError = ''

        for (let attempt = 1; attempt <= 2; attempt++) {
            const sessionId = `research-${Date.now()}-${attempt}`
            console.log(`Research attempt ${attempt}/2, session: ${sessionId}, model: ${researchModel}`)

            try {
                // Use סייר agent (registered with Opus model) for research
                const output = await sshExec(instance.ip,
                    `su - openclaw -c 'timeout 180 openclaw agent --agent sayer --session-id ${sessionId} -m "$(echo ${b64Prompt} | base64 -d)" --json 2>&1'`,
                    instance.rootPassword || undefined
                )

                // Parse response
                try {
                    const agentResult = JSON.parse(output)
                    report = agentResult?.result?.payloads?.[0]?.text || ''
                    const usedModel = agentResult?.result?.meta?.agentMeta?.model || ''
                    console.log(`Research agent used model: ${usedModel}`)

                    // Check for rate limit error
                    if (agentResult?.result?.meta?.agentMeta?.error || output.includes('rate_limit')) {
                        lastError = `rate_limit:${usedModel || researchModel}`
                        console.log(`Research rate limited on ${usedModel}, attempt ${attempt}`)
                        report = '' // force retry or fail
                    }
                } catch {
                    report = output
                }

                // Validate
                const validation = validateResearchReport(report)
                if (validation.valid) {
                    console.log(`Research validated OK: ${report.length} chars`)
                    break
                } else {
                    console.log(`Research validation failed (attempt ${attempt}): ${validation.reason}`)
                    lastError = validation.reason || 'validation_failed'
                    if (attempt < 2) {
                        report = '' // clear for retry
                        await new Promise(r => setTimeout(r, 3000)) // wait before retry
                    }
                }
            } catch (err) {
                console.error(`Research attempt ${attempt} error:`, err)
                lastError = 'ssh_error'
            }
        }

        // Final check
        if (!report || report.length < 500) {
            const errorMsg = lastError.startsWith('rate_limit')
                ? `rate limit — נסו להחליף מודל או לנסות שוב מאוחר יותר`
                : `המחקר לא הצליח (${lastError}) — נסו שוב`

            // Notify user via Telegram through מטה
            try {
                await sshExec(instance.ip,
                    `su - openclaw -c 'openclaw agent --agent main --session-id notify-${Date.now()} --deliver --channel telegram -m "⚠️ המחקר נכשל: ${lastError}. בדקו את לוח הבקרה לפרטים נוספים." --json 2>/dev/null' 2>&1`,
                    instance.rootPassword || undefined
                )
            } catch { /* non-critical */ }

            return fail(c, errorMsg, 500)
        }

        // Save full report to DB
        const existingData = (instance.researchData as any) || {}
        await db.update(instances).set({
            researchData: {
                ...existingData,
                report,
                researchModel,
                researchGeneratedAt: new Date().toISOString(),
            } as any,
        }).where(eq(instances.id, instanceId))

        // Save as RESEARCH_REPORT.md on VPS (for strategy agent to read)
        const b64Report = Buffer.from(report).toString('base64')
        await sshExec(instance.ip,
            `echo ${b64Report} | base64 -d > /home/openclaw/.openclaw/workspace/RESEARCH_REPORT.md && chown openclaw:openclaw /home/openclaw/.openclaw/workspace/RESEARCH_REPORT.md`,
            instance.rootPassword || undefined
        )

        console.log(`Research complete for ${businessName} (${report.length} chars, model: ${researchModel})`)
        return ok(c, { report, model: researchModel }, 'Research complete.')
    } catch (err) {
        console.error('runResearch error:', err)
        return fail(c, 'Research failed.', 500)
    }
}

// ── POST /hosting/instances/:id/setup/agents/strategy ──
// Generates strategy based on research report. Runs on VPS agent.
export const buildStrategy = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))

        if (!instance?.ip) {
            return fail(c, 'Instance not found or not ready.', 404)
        }

        const rd = (instance.researchData as any) || {}
        if (!rd.report) {
            return fail(c, 'יש להריץ מחקר שוק קודם', 400)
        }

        const answers = rd.answers || {}
        const businessName = answers.businessName || 'העסק'

        console.log(`Building strategy for ${businessName} on ${instance.ip}...`)

        const strategyPrompt = `על סמך דוח המחקר שכבר ביצעת — בנה אסטרטגיית שיווק מפורטת עבור ${businessName}.

הדוח כבר נמצא ב-RESEARCH_REPORT.md בתיקיית workspace — קרא אותו.

בנה אסטרטגיה שכוללת:

## 1. פוזיציונינג
- positioning statement אחד ברור
- USP — מה מבדיל אותנו

## 2. מטרות (3 חודשים)
- 3 מטרות מדידות עם KPIs ספציפיים
- יעדים מספריים

## 3. עמודי תוכן (Content Pillars)
- 4-5 עמודי תוכן עם דוגמאות לנושאים
- תדירות מומלצת לכל עמוד

## 4. תוכנית שבועית
- לוח זמנים: מה מפרסמים בכל יום
- באילו פלטפורמות

## 5. הנחיות לסוכנים
לכל אחד מ-9 הסוכנים — 2-3 משפטים:
- מטה: מה מתאם
- סייר: מה חוקר ובאיזו תדירות
- מאתר: אילו מילות מפתח עוקב
- מאזין: אילו שיחות מנטר
- מנתח: מה מנתח ובאיזה מודל
- עט: איזה סוג תוכן כותב
- יוצר: איזה ויזואלים
- שליח: לאן מפיץ ומתי
- מגדלור: מה בודק

## 6. תקציב חודשי
- חלוקה: אורגני vs ממומן
- עלות משוערת לכל ערוץ

כתוב בעברית. תכליתי ואקשנאבילי. אל תשלח לטלגרם.`

        // Use מנתח (analyst) model for strategy — needs depth
        const strategyModel = await getSubAgentModel(instanceId, 'menateach')
        console.log(`Strategy model: ${strategyModel}`)

        const b64Prompt = Buffer.from(strategyPrompt + '\n\nאורך מינימלי: 2000 תווים.').toString('base64')

        // Retry loop
        let strategy = ''
        let lastError = ''

        for (let attempt = 1; attempt <= 2; attempt++) {
            const sessionId = `strategy-${Date.now()}-${attempt}`

            try {
                // Use מנתח agent (registered with Opus model) for strategy
                const output = await sshExec(instance.ip,
                    `su - openclaw -c 'timeout 180 openclaw agent --agent menateach --session-id ${sessionId} -m "$(echo ${b64Prompt} | base64 -d)" --json 2>&1'`,
                    instance.rootPassword || undefined
                )

                try {
                    const agentResult = JSON.parse(output)
                    strategy = agentResult?.result?.payloads?.[0]?.text || ''
                    if (output.includes('rate_limit')) {
                        lastError = 'rate_limit'
                        strategy = ''
                    }
                } catch {
                    strategy = output
                }

                // Validate
                if (strategy && strategy.length >= 1500 && !strategy.includes('כבר מוכן')) {
                    break
                }
                lastError = strategy.length < 1500 ? 'too_short' : 'cached'
                if (attempt < 2) {
                    strategy = ''
                    await new Promise(r => setTimeout(r, 3000))
                }
            } catch (err) {
                lastError = 'error'
            }
        }

        if (!strategy || strategy.length < 500) {
            const msg = lastError === 'rate_limit'
                ? 'rate limit — נסו שוב מאוחר יותר או החליפו מודל'
                : 'האסטרטגיה לא נוצרה — נסו שוב'
            return fail(c, msg, 500)
        }

        // Save to DB
        await db.update(instances).set({
            researchData: {
                ...rd,
                strategy,
                strategyGeneratedAt: new Date().toISOString(),
            } as any,
        }).where(eq(instances.id, instanceId))

        // Save as STRATEGY.md on VPS
        const b64Strategy = Buffer.from(strategy).toString('base64')
        await sshExec(instance.ip,
            `echo ${b64Strategy} | base64 -d > /home/openclaw/.openclaw/workspace/STRATEGY.md && chown openclaw:openclaw /home/openclaw/.openclaw/workspace/STRATEGY.md`,
            instance.rootPassword || undefined
        )

        console.log(`Strategy complete for ${businessName} (${strategy.length} chars)`)
        return ok(c, { strategy }, 'Strategy complete.')
    } catch (err) {
        console.error('buildStrategy error:', err)
        return fail(c, 'Strategy failed.', 500)
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
