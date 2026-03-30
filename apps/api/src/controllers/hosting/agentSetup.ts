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
    // Install research and productivity skills via OpenClaw CLI
    await sshExec(ip, `
        su - openclaw -c '
        openclaw skills install brave-search 2>/dev/null;
        openclaw skills install brave-headless 2>/dev/null;
        openclaw skills install openai-whisper-api 2>/dev/null;
        openclaw skills install brainz-calendar 2>/dev/null;
        ' || true
    `, password)

    // Clean up: remove redundant files and clear session history to reduce token usage
    await sshExec(ip, `
        rm -f ${baseDir}/workspace/BOOTSTRAP.md ${baseDir}/workspace/TOOLS.md ${baseDir}/workspace/IDENTITY.md 2>/dev/null;
        rm -rf ${baseDir}/workspace/.git 2>/dev/null;
        echo '{}' > ${baseDir}/agents/main/sessions/sessions.json 2>/dev/null;
        mkdir -p ${baseDir}/research-data 2>/dev/null;
        chown -R openclaw:openclaw ${baseDir}
    `, password)

    // Set token-optimized bootstrap config
    await sshExec(ip, `
        cd ${baseDir} && python3 -c "
import json
with open('openclaw.json') as f:
    cfg = json.load(f)
d = cfg.setdefault('agents', {}).setdefault('defaults', {})
d['bootstrapMaxChars'] = 8000
d['bootstrapTotalMaxChars'] = 20000
d['bootstrapPromptTruncationWarning'] = 'always'
d['compaction'] = {'reserveTokens': 40000, 'keepRecentTokens': 20000, 'reserveTokensFloor': 20000}
with open('openclaw.json', 'w') as f:
    json.dump(cfg, f, indent=2)
" && chown openclaw:openclaw openclaw.json
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

    // Register sub-agents with correct models per role
    // Uses model registry: sayer=opus, et=sonnet, menateach=opus
    // Falls back to OpenAI models if Anthropic not available
    await sshExec(ip, `
        su - openclaw -c '
        # Detect which AI provider is available
        HAS_ANTHROPIC=$(grep -c ANTHROPIC_API_KEY /etc/systemd/system/openclaw-gateway.service 2>/dev/null || echo 0)

        if [ "$HAS_ANTHROPIC" -gt 0 ]; then
          SAYER_MODEL="anthropic/claude-opus-4-6"
          MENATEACH_MODEL="anthropic/claude-opus-4-6"
          ET_MODEL="anthropic/claude-sonnet-4-6"
        else
          SAYER_MODEL="openai/gpt-4o"
          MENATEACH_MODEL="openai/gpt-4o"
          ET_MODEL="openai/gpt-4o"
        fi

        AGENTS=$(openclaw agents list --json 2>/dev/null | node -e "try{const d=JSON.parse(require(\"fs\").readFileSync(\"/dev/stdin\",\"utf-8\"));console.log(d.map(a=>a.name).join(\",\"))}catch(e){}" 2>/dev/null)

        if ! echo "$AGENTS" | grep -q "sayer"; then
          openclaw agents add sayer --model "$SAYER_MODEL" --workspace ~/.openclaw/workspace --agent-dir ~/.openclaw/agents/sayer --non-interactive 2>/dev/null
        fi
        if ! echo "$AGENTS" | grep -q "menateach"; then
          openclaw agents add menateach --model "$MENATEACH_MODEL" --workspace ~/.openclaw/workspace --agent-dir ~/.openclaw/agents/menateach --non-interactive 2>/dev/null
        fi
        if ! echo "$AGENTS" | grep -q "et"; then
          openclaw agents add et --model "$ET_MODEL" --workspace ~/.openclaw/workspace --agent-dir ~/.openclaw/agents/et --non-interactive 2>/dev/null
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
    'mateh': 'openai/gpt-4o',
    'sayer': 'anthropic/claude-sonnet-4-6',
    'meater': 'anthropic/claude-sonnet-4-6',
    'maazin': 'anthropic/claude-sonnet-4-6',
    'menateach': 'anthropic/claude-sonnet-4-6',
    'et': 'anthropic/claude-sonnet-4-6',
    'yotzer': 'anthropic/claude-sonnet-4-6',
    'shaliach': 'openai/gpt-4o-mini',
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
                    `su - openclaw -c 'timeout 300 openclaw agent --agent sayer --session-id ${sessionId} -m "$(echo ${b64Prompt} | base64 -d)" --json 2>&1'`,
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

                // If agent saved to file instead of returning inline, read it
                if (report && report.length < 2000 && (report.includes('.md') || report.includes('שמורה') || report.includes('מוכן'))) {
                    try {
                        const fileContent = await sshExec(instance.ip,
                            `cat /home/openclaw/.openclaw/workspace/agents/sayer/output/market-research*.md 2>/dev/null | head -500 || echo ""`,
                            instance.rootPassword || undefined
                        )
                        if (fileContent && fileContent.length > 2000) {
                            report = fileContent
                            console.log(`Read research from file: ${report.length} chars`)
                        }
                    } catch { /* fallback failed */ }
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
// Strategy pipeline stages
// ── Helper: extract structured data points from research for injection ──
function extractResearchData(rd: any): {
    competitors: string;
    keywords: string;
    audiences: string;
    channels: string;
    painPoints: string;
} {
    const allResearch = [rd.stage1, rd.stage2, rd.stage3, rd.stage4].filter(Boolean).join('\n')

    // Extract competitor mentions (lines with competitor-like patterns)
    const competitorLines = allResearch.split('\n')
        .filter(l => l.match(/מתחר|competitor|vs\b|לעומת|\.com|\.io|\.ai|\.co\.il|מחיר.*₪|תמחור/i))
        .slice(0, 20)
    const competitors = competitorLines.length > 0
        ? competitorLines.join('\n')
        : 'לא נמצאו מתחרים ספציפיים במחקר'

    // Extract keyword mentions
    const keywordLines = allResearch.split('\n')
        .filter(l => l.match(/מילת מפתח|keyword|חיפוש|search volume|נפח|ביקוש|SEO|SERP/i))
        .slice(0, 15)
    const keywords = keywordLines.length > 0
        ? keywordLines.join('\n')
        : 'לא נמצאו מילות מפתח ספציפיות במחקר'

    // Extract audience/persona mentions
    const audienceLines = allResearch.split('\n')
        .filter(l => l.match(/קהל יעד|פרסונה|persona|target|דמוגרפ|גיל|audience|לקוח|כאב|pain point|צורך/i))
        .slice(0, 15)
    const audiences = audienceLines.length > 0
        ? audienceLines.join('\n')
        : 'לא נמצא מידע על קהל יעד במחקר'

    // Extract channel mentions
    const channelLines = allResearch.split('\n')
        .filter(l => l.match(/ערוץ|channel|פלטפורמה|אינסטגרם|פייסבוק|טיקטוק|לינקדאין|יוטיוב|טלגרם|google ads|meta ads/i))
        .slice(0, 10)
    const channels = channelLines.length > 0
        ? channelLines.join('\n')
        : 'לא נמצא מידע על ערוצים במחקר'

    // Extract pain points
    const painLines = allResearch.split('\n')
        .filter(l => l.match(/כאב|בעיה|אתגר|מתסכל|חסר|קושי|frustrat|problem|challenge|gap/i))
        .slice(0, 10)
    const painPoints = painLines.length > 0
        ? painLines.join('\n')
        : 'לא נמצאו כאבים ספציפיים במחקר'

    return { competitors, keywords, audiences, channels, painPoints }
}

// ── Anti-hallucination + self-reflection block (appended to every stage) ──
const QUALITY_GUARDRAILS = `

---
## הנחיות קריטיות לאיכות

**אנטי-הזיה:** השתמש אך ורק במידע שמופיע במחקר שלמעלה. אם אין לך מידע ספציפי על נקודה מסוימת — כתוב "לא נמצא במחקר — דורש בדיקה נוספת" במקום להמציא שמות, מספרים, או URLs.

**בדיקה עצמית — לפני שתסיים, וודא:**
1. האם כל שם מתחרה שהזכרת מופיע במחקר למעלה? אם לא — מחק אותו
2. האם ה-KPIs ריאליסטיים לעסק בגודל הזה בשוק הישראלי? (עסק חדש ≠ 200 לקוחות בחודש)
3. האם הפרסונות מבוססות על נתוני קהל היעד מהמחקר, ולא גנריות?
4. האם יש מספרים ותקציבים ריאליים ולא סתם placeholders?
5. האם הטקסט בעברית תקינה ללא שגיאות או מילים חסרות משמעות?`

const STRATEGY_STAGES = [
    {
        id: 1,
        name: 'פוזיציונינג ומטרות',
        prompt: (biz: string, research: string, answers: any, _prev: string, extracted: ReturnType<typeof extractResearchData>) => `אתה מומחה אסטרטגיית שיווק ישראלי ברמה הגבוהה ביותר. שלב 1 מתוך 4 — פוזיציונינג ומטרות.

בוא נחשוב צעד אחר צעד לפני שנכתוב.

## מידע על העסק
- שם: ${biz}
- תחום: ${answers.businessDescription || 'לא צוין'}
- טון מותג: ${answers.tone || 'ידידותי ונגיש'}
- תקציב: ${answers.budget || 'לא צוין'}
- מטרות: ${answers.marketingGoals || 'לא צוין'}

## ממצאי המחקר המלאים
${research}

## נתונים ספציפיים שנמצאו במחקר (חובה להשתמש בהם):

### מתחרים שנמצאו:
${extracted.competitors}

### קהלי יעד שנמצאו:
${extracted.audiences}

### כאבים ובעיות שנמצאו:
${extracted.painPoints}

---

כתוב אסטרטגיה מפורטת ומבוססת נתונים:

## 1. פוזיציונינג
- **Positioning statement** (משפט אחד חד וברור — חייב להתייחס למתחרים הספציפיים שנמצאו)
- **USP** — 3 נקודות בידול ספציפיות. לכל נקודה: מה אנחנו עושים → מה המתחרה עושה → למה אנחנו טובים יותר (ציין שמות מתחרים אמיתיים מהמחקר)
- **Elevator pitch** (30 שניות, בעברית תקינה וזורמת — קרא בקול רם לפני שתשלח)
- **מיפוי תחרותי**: טבלת 2x2 — ציר X: מחיר (נמוך↔גבוה), ציר Y: מורכבות (פשוט↔מתקדם). מקם את ${biz} ואת כל המתחרים שנמצאו

## 2. מטרות (3 חודשים)
חשוב: KPIs חייבים להיות ריאליים. עסק חדש/קטן בישראל:
- חודש 1: בניית נוכחות (לא מכירות מאסיביות)
- חודש 2: תנועה ראשונית + לידים ראשונים
- חודש 3: המרות ראשונות + אופטימיזציה

- 3 מטרות SMART עם KPIs מספריים ריאליים
- טבלה: מטרה | KPI | יעד חודש 1 | יעד חודש 2 | יעד חודש 3
- North Star Metric — המדד האחד שמוביל הכל (הסבר למה דווקא הוא)

## 3. ICP (Ideal Customer Profile)
בנה פרסונות על בסיס נתוני קהל היעד מהמחקר למעלה (לא להמציא!):
- **פרסונה #1**: שם עברי אותנטי, גיל, תפקיד, כאב ספציפי (מהמחקר), מוטיבציה, ערוץ מועדף, trigger לרכישה, התנגדויות צפויות
- **פרסונה #2**: שם עברי אותנטי, גיל, תפקיד, כאב ספציפי (מהמחקר), מוטיבציה, ערוץ מועדף, trigger לרכישה, התנגדויות צפויות
- **Message-Market Fit**: לכל פרסונה — מה המסר המדויק שיגרום לה לפעול, ובאיזה ערוץ
${QUALITY_GUARDRAILS}`,
    },
    {
        id: 2,
        name: 'תוכן וערוצים',
        prompt: (biz: string, research: string, answers: any, prev: string, extracted: ReturnType<typeof extractResearchData>) => `שלב 2 מתוך 4 — תוכן וערוצים. אתה מומחה אסטרטגיית תוכן ישראלי.

בוא נחשוב צעד אחר צעד לפני שנכתוב.

## העסק: ${biz}

## שלב קודם (פוזיציונינג ומטרות):
${prev}

## ממצאי המחקר המלאים:
${research}

## נתונים ספציפיים מהמחקר:

### מילות מפתח שנמצאו:
${extracted.keywords}

### ערוצים שנמצאו:
${extracted.channels}

### קהלי יעד:
${extracted.audiences}

## מידע מהמשתמש:
- פלטפורמות: ${answers.platforms || 'לא צוין'}
- תוכן קיים: ${answers.currentContent || 'אין'}
- תקציב: ${answers.budget || 'לא צוין'}

---

כתוב:

## 4. עמודי תוכן (Content Pillars)
5 עמודי תוכן, לכל אחד:
- **שם העמוד** (בעברית, ספציפי לתחום של ${biz})
- **מטרה**: awareness / consideration / conversion
- **5 נושאים ספציפיים** (כותרות מאמרים/פוסטים אמיתיים, לא "תוכן על X" אלא כותרת שתופיע בפועל)
- **פורמט מומלץ** לכל נושא (בלוג / וידאו / carousel / reels / newsletter / podcast)
- **תדירות**: כמה פעמים בשבוע/חודש
- **קשר לפרסונה**: איזו פרסונה מהשלב הקודם זה פונה אליה

## 5. לוח שבועי מפורט
טבלה מלאה:
| יום | שעה | פלטפורמה | פורמט | נושא ספציפי | עמוד תוכן | פרסונה |
(ימים א-ה, כולל שעות peak לכל פלטפורמה בישראל)

## 6. ערוצים לפי עדיפות
דרג כל ערוץ (1 = הכי חשוב). לכל ערוץ:
- **למה?** — קשר ישיר לפרסונה + נתונים מהמחקר (ציין מקור)
- **פורמט מתאים** עם דוגמה קונקרטית
- **תדירות** מדויקת
- **KPI ספציפי** עם יעד מספרי ריאלי
- **עלות**: שעות עבודה בשבוע + תקציב כספי אם רלוונטי
${QUALITY_GUARDRAILS}`,
    },
    {
        id: 3,
        name: 'אורגני וממומן',
        prompt: (biz: string, research: string, answers: any, prev: string, extracted: ReturnType<typeof extractResearchData>) => `שלב 3 מתוך 4 — אסטרטגיית אורגני + ממומן. אתה מומחה שיווק דיגיטלי ישראלי עם ניסיון בתקציבים קטנים-בינוניים.

בוא נחשוב צעד אחר צעד לפני שנכתוב.

## העסק: ${biz}

## שלבים קודמים (פוזיציונינג + תוכן):
${prev}

## ממצאי המחקר המלאים:
${research}

## נתונים ספציפיים מהמחקר:

### מתחרים:
${extracted.competitors}

### מילות מפתח:
${extracted.keywords}

### ערוצים:
${extracted.channels}

## מידע מהמשתמש:
- תקציב: ${answers.budget || 'לא צוין — התאם להמלצות לעסק חדש/קטן בישראל'}
- מטרות שיווק: ${answers.marketingGoals || 'לא צוין'}

---

כתוב:

## 7. Marketing Funnel מפורט
לכל שלב, פעולות ספציפיות עם תקציבים ריאליים ל-${biz}:
- **Awareness**: ערוצים + סוג תוכן + KPI + תקציב חודשי ב-₪
- **Consideration**: ערוצים + lead magnets ספציפיים + KPI + תקציב ב-₪
- **Conversion**: CTA מדויק + landing page structure + offer + תקציב ב-₪
- **Retention**: onboarding flow (כמה מיילים, באיזו תדירות) + community
- **Advocacy**: referral program ספציפי + reviews strategy

## 8. אסטרטגיית SEO
- **10 מילות מפתח מתועדפות** — חייב להשתמש במילות מפתח מהמחקר למעלה. לכל מילה: נפח חיפוש משוער, קושי, עדיפות
- **תוכנית תוכן SEO**: כמה מאמרים בחודש, אורך מומלץ, מבנה מאמר (H1/H2/H3)
- **3 כותרות מאמרים ספציפיים** לחודש הראשון (כותרות אמיתיות, לא placeholders)
- Internal linking strategy
- Technical SEO checklist (5 פריטים קריטיים)

## 9. אסטרטגיית Paid
**חשוב:** אם התקציב קטן או לא צוין — התחל אורגני. Paid רק אחרי validation אורגני.
- **מתי להתחיל?** trigger מדויק (כמה conversions אורגניים, כמה traffic)
- **Google Ads**: 5 keywords ספציפיים מהמחקר, תקציב יומי ב-₪, CPC צפוי בשוק הישראלי
- **Meta Ads**: audiences מפורטים (גיל, מיקום, תחומי עניין), תקציב ב-₪, 2 סוגי creatives
- **Retargeting**: audiences, budget, messaging
- **A/B testing**: 3 ניסויים ספציפיים עם hypothesis ומדד הצלחה

## 10. תקציב חודשי
טבלה עם מספרים ריאליים ב-₪:
| ערוץ | חודש 1-3 (₪) | חודש 4-6 (₪) | חודש 7-12 (₪) | ROI צפוי |

סה"כ חודשי + הערות
${QUALITY_GUARDRAILS}`,
    },
    {
        id: 4,
        name: 'הנחיות סוכנים',
        prompt: (biz: string, research: string, answers: any, prev: string, extracted: ReturnType<typeof extractResearchData>) => `שלב 4 מתוך 4 — הנחיות ביצוע ל-9 סוכני AI. אתה מומחה בתפעול סוכני AI לשיווק.

בוא נחשוב צעד אחר צעד: מה כל סוכן צריך לדעת כדי לפעול עצמאית עבור ${biz}.

## העסק: ${biz}

## כל שלבי האסטרטגיה הקודמים:
${prev}

## ממצאי המחקר המלאים:
${research}

## נתונים ספציפיים:

### מתחרים לניטור:
${extracted.competitors}

### מילות מפתח לניטור:
${extracted.keywords}

### ערוצים פעילים:
${extracted.channels}

---

כתוב הנחיות מפורטות ואקשנאביליות. כל סוכן חייב לקבל הנחיות ספציפיות ל-${biz}, לא גנריות.

## 11. הנחיות מפורטות ל-9 סוכנים

**מטה (מתאם):**
- מה מתאם בין הסוכנים (ספציפי ל-${biz})
- תדירות תיאום: יומי/שבועי
- מה מדווח ולמי
- triggers להתראה דחופה (ספציפי — לא "כשקורה משהו חשוב")

**סייר (מחקר שוק):**
- אילו אתרים ספציפיים לסרוק (URLs של מתחרים מהמחקר)
- תדירות סריקה
- מה מחפש (שינויי מחיר, פיצ'רים חדשים, תוכן חדש)
- trigger לדיווח דחוף

**מאתר (SERP):**
- אילו מילות מפתח ספציפיות לעקוב (מהמחקר למעלה!)
- תדירות בדיקה
- format דיווח: טבלת מיקום שבועית

**מאזין (חברתי):**
- אילו פלטפורמות ספציפיות
- אילו hashtags, keywords, accounts לנטר (ספציפי ל-${biz})
- תדירות סריקה
- מה נחשב "אזכור חשוב"

**מנתח (ניתוח):**
- מה מנתח: engagement, reach, conversions, sentiment
- מודל ניקוד ספציפי (1-10 על מה?)
- threshold לפעולה (מתי מדווח / מתי פועל עצמאית)

**עט (תוכן):**
- סוגי תוכן ל-${biz} (רשימה ספציפית)
- אורך לכל פלטפורמה (מספר מילים/תווים)
- כללי סגנון: טון, מילים לשימוש, מילים להימנע
- כללי de-ai-ify (איך התוכן נשמע אנושי)

**יוצר (ויזואל):**
- סוגי ויזואלים ל-${biz}
- מידות per platform
- סגנון: צבעים, פונטים, mood
- branding guidelines

**שליח (הפצה):**
- סדר הפצה (איזה ערוץ קודם)
- שעות פרסום peak בישראל per platform
- כלל אישור: מה דורש אישור אנושי ומה עובר אוטומטי
- formatting per platform (hashtags, emojis, CTA)

**מגדלור (AEO):**
- מה בודק: נוכחות ב-ChatGPT, Gemini, Perplexity
- אילו שאילתות ספציפיות ל-${biz}
- תדירות בדיקה
- format דוח

## 12. תוכנית תגובה תחרותית
בהתבסס על המתחרים שנמצאו במחקר:
- **Trigger A**: מתחרה ספציפי (ציין שם) מפרסם בעברית → Response + Timeline
- **Trigger B**: מתחרה מוריד מחיר / משנה הצעה → Response + Timeline
- **Trigger C**: שחקן חדש נכנס לשוק → Response + Timeline

## 13. 3 דברים לעשות השבוע
פעולות ספציפיות, אקשנאביליות, עם deadline:
- פעולה 1: [מה] + [איך] + [עד מתי]
- פעולה 2: [מה] + [איך] + [עד מתי]
- פעולה 3: [מה] + [איך] + [עד מתי]
${QUALITY_GUARDRAILS}`,
    },
]

// ── POST /hosting/instances/:id/setup/agents/strategy ──
// Strategy via DIRECT API call — multi-stage pipeline
export const buildStrategy = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))

        if (!instance?.ip) {
            return fail(c, 'Instance not found or not ready.', 404)
        }

        const { stage: requestedStage, model: requestedModel } = await c.req.json<{ stage?: number; model?: string }>().catch(() => ({ stage: undefined, model: undefined }))
        const rd = (instance.researchData as any) || {}
        if (!rd.stage1 && !rd.report) {
            return fail(c, 'יש להריץ מחקר שוק קודם', 400)
        }

        const answers = rd.answers || {}
        const businessName = answers.businessName || 'העסק'

        // Determine which strategy stage to run
        const stage = requestedStage || (rd.strategyStage1 ? (rd.strategyStage2 ? (rd.strategyStage3 ? 4 : 3) : 2) : 1)
        const stageConfig = STRATEGY_STAGES[stage - 1]
        if (!stageConfig) return fail(c, 'Invalid strategy stage', 400)

        console.log(`Strategy stage ${stage}/4 for ${businessName} via direct API...`)

        // Build FULL research context — no truncation! Sonnet 200K can handle ~27K chars easily
        const researchContext = [
            rd.stage1 ? `## שלב 1 — סקירת שוק ומתחרים\n${rd.stage1}` : '',
            rd.stage2 ? `## שלב 2 — מילות מפתח וSEO\n${rd.stage2}` : '',
            rd.stage3 ? `## שלב 3 — קהל יעד ופרסונות\n${rd.stage3}` : '',
            rd.stage4 ? `## שלב 4 — ערוצים ואסטרטגיה\n${rd.stage4}` : '',
        ].filter(Boolean).join('\n\n---\n\n')

        // Extract specific data points for injection into prompts
        const extracted = extractResearchData(rd)

        // Previous strategy stages — FULL context (no truncation)
        const prevStrategy = [
            rd.strategyStage1 || '',
            rd.strategyStage2 || '',
            rd.strategyStage3 || '',
        ].filter(Boolean).join('\n\n---\n\n')

        const strategyPrompt = stageConfig.prompt(businessName, researchContext, answers, prevStrategy, extracted)
        console.log(`Strategy prompt: ${strategyPrompt.length} chars (research: ${researchContext.length}, prev: ${prevStrategy.length})`)

        // DIRECT API CALL — no OpenClaw agent overhead (saves ~22K tokens)
        const apiKey = await getApiKeyForInstance(instanceId)
        if (!apiKey) {
            return fail(c, 'מפתח API לא מוגדר', 400)
        }

        // Model selection: user can choose opus for higher quality strategy
        const ALLOWED_MODELS = ['claude-sonnet-4-6', 'claude-opus-4-6']
        const strategyModel = requestedModel && ALLOWED_MODELS.includes(requestedModel)
            ? requestedModel
            : 'claude-sonnet-4-6'

        console.log(`Strategy via direct API — model: ${strategyModel} (key: ${apiKey.substring(0, 12)}...)`)

        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: strategyModel,
                max_tokens: 8192,
                messages: [{ role: 'user', content: strategyPrompt }],
            }),
        })

        // Fallback to OpenAI if Anthropic fails
        let strategy = ''
        if (res.ok) {
            const data = await res.json() as { content?: Array<{ text: string }> }
            strategy = data.content?.[0]?.text || ''
            console.log(`Strategy from Anthropic: ${strategy.length} chars`)
        } else {
            const errBody = await res.text().catch(() => 'no body')
            console.error(`Anthropic failed (${res.status}): ${errBody.substring(0, 500)}`)
            // Try OpenAI
            const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
            const openaiKey = inst?.openaiApiKey
            if (openaiKey) {
                const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${openaiKey}`,
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o',
                        max_tokens: 8192,
                        messages: [{ role: 'user', content: strategyPrompt }],
                    }),
                })
                if (oaiRes.ok) {
                    const oaiData = await oaiRes.json() as { choices?: Array<{ message?: { content?: string } }> }
                    strategy = oaiData.choices?.[0]?.message?.content || ''
                    console.log(`Strategy from OpenAI: ${strategy.length} chars`)
                } else {
                    const errText = await oaiRes.text()
                    console.error(`OpenAI also failed (${oaiRes.status}):`, errText.substring(0, 200))
                }
            }
        }

        if (!strategy || strategy.length < 500) {
            return fail(c, `שלב ${stage} של האסטרטגיה נכשל — נסו שוב`, 500)
        }

        // ── Post-generation validation ──
        // Check that output references real research data (not hallucinated)
        const validationWarnings: string[] = []

        // Check if competitor names from research appear in output
        const competitorNames = extracted.competitors.split('\n')
            .map(l => l.match(/([A-Za-z\u0590-\u05FF][\w\u0590-\u05FF.-]+(?:\.com|\.io|\.ai|\.co\.il)?)/)?.[1])
            .filter(Boolean) as string[]
        if (competitorNames.length > 0) {
            const mentionedCount = competitorNames.filter(name =>
                strategy.includes(name)
            ).length
            if (mentionedCount === 0 && stage <= 3) {
                validationWarnings.push(`אזהרה: אף מתחרה מהמחקר לא מוזכר בתוצאה (${competitorNames.slice(0, 3).join(', ')})`)
            }
        }

        // Check for hallucination markers (nonsensical Hebrew)
        if (strategy.match(/מיואם|לורם|איפסום|lorem|ipsum/i)) {
            validationWarnings.push('אזהרה: נמצא טקסט placeholder/שגוי בתוצאה')
        }

        // Check KPI realism for stage 1
        if (stage === 1 && strategy.match(/(\d{3,})\s*(לקוחות|customers|רשומים|sign.?ups)/i)) {
            const match = strategy.match(/(\d{3,})\s*(לקוחות|customers|רשומים|sign.?ups)/i)
            if (match && parseInt(match[1]) > 100) {
                validationWarnings.push(`אזהרה: KPI לא ריאלי — ${match[0]} (עסק חדש בישראל)`)
            }
        }

        if (validationWarnings.length > 0) {
            console.warn(`Strategy stage ${stage} validation warnings:`, validationWarnings)
        }

        // Save stage to DB
        const stageKey = `strategyStage${stage}`
        const updateData: Record<string, unknown> = {
            ...rd,
            [stageKey]: strategy,
            [`${stageKey}GeneratedAt`]: new Date().toISOString(),
            [`${stageKey}Warnings`]: validationWarnings.length > 0 ? validationWarnings : undefined,
        }

        // If last stage (4) — combine all into FULL strategy (no truncation!)
        if (stage === 4) {
            const fullStrategy = [
                rd.strategyStage1 || '',
                rd.strategyStage2 || '',
                rd.strategyStage3 || '',
                strategy,
            ].join('\n\n---\n\n')
            updateData.strategy = fullStrategy
            updateData.strategyGeneratedAt = new Date().toISOString()

            // Save full strategy to research-data (not loaded in system prompt)
            const b64Full = Buffer.from(fullStrategy).toString('base64')
            await sshExec(instance.ip,
                `mkdir -p /home/openclaw/.openclaw/research-data && echo ${b64Full} | base64 -d > /home/openclaw/.openclaw/research-data/STRATEGY_FULL.md && chown openclaw:openclaw /home/openclaw/.openclaw/research-data/STRATEGY_FULL.md`,
                instance.rootPassword || undefined
            )

            // Save compact summary in workspace (token-optimized: ~3KB)
            const compact = fullStrategy.substring(0, 3000) + '\n\n---\nהאסטרטגיה המלאה: research-data/STRATEGY_FULL.md\nקרא רק כשצריך פרטים.'
            const b64Compact = Buffer.from(compact).toString('base64')
            await sshExec(instance.ip,
                `echo ${b64Compact} | base64 -d > /home/openclaw/.openclaw/workspace/STRATEGY.md && chown openclaw:openclaw /home/openclaw/.openclaw/workspace/STRATEGY.md`,
                instance.rootPassword || undefined
            )
            console.log(`Strategy saved: full=${fullStrategy.length} chars, compact=${compact.length} chars`)
        }

        await db.update(instances).set({
            researchData: updateData as any,
        }).where(eq(instances.id, instanceId))

        console.log(`Strategy stage ${stage}/4 complete: ${strategy.length} chars`)
        return ok(c, {
            stage,
            strategy,
            nextStage: stage < 4 ? stage + 1 : null,
            isComplete: stage === 4,
            warnings: validationWarnings.length > 0 ? validationWarnings : undefined,
        }, `Strategy stage ${stage} complete.`)
    } catch (err) {
        console.error('buildStrategy error:', err)
        return fail(c, 'Strategy failed.', 500)
    }
}

// ── POST /hosting/instances/:id/setup/agents/research/stage ──
// Multi-stage research pipeline with user checkpoints
export const researchStage = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const { stage, feedback } = await c.req.json<{ stage: number; feedback?: string }>()
        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))

        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const rd = (instance.researchData as any) || {}
        const answers = rd.answers || {}
        const businessName = answers.businessName || 'העסק'
        const businessDesc = answers.businessDescription || ''

        // Determine which agent and prompt based on stage
        let agentId = 'sayer'
        let prompt = ''
        let minLength = 1000

        if (stage === 1) {
            // DISCOVERY — find competitors
            agentId = 'sayer'
            prompt = `משימת גילוי מתחרים עבור "${businessName}" (${businessDesc}).

חפש באינטרנט (השתמש ב-web search ובדפדפן):
1. מצא 5 מתחרים ישירים. לכל אחד: שם, URL, מה עושים, מחיר אם נראה, חוזקות, חולשות
2. חפש את "${businessName}" עצמו — מה קיים עליו באינטרנט?
3. מהם הטרנדים העיקריים בתחום?
${answers.competitors ? `המשתמש ציין מתחרים: ${answers.competitors}` : ''}
${feedback ? `הערות המשתמש: ${feedback}` : ''}

כתוב הכל כאן בתשובה — לא בקובץ. בעברית.`
            minLength = 1500
        } else if (stage === 2) {
            // KEYWORD RESEARCH
            agentId = 'sayer'
            prompt = `משימת מחקר מילות מפתח עבור "${businessName}".

קרא את תוצאות שלב 1 (מתחרים) מ-RESEARCH_STAGE1.md.

חפש באינטרנט:
1. 15 מילות מפתח רלוונטיות (עברית + אנגלית)
2. לכל מילה: כוונת חיפוש (מסחרית/מידעית), תחרות משוערת, עדיפות
3. שאלות נפוצות שאנשים שואלים בתחום (5-10)
4. long-tail keywords (5-10)
${answers.platforms ? `פלטפורמות: ${answers.platforms}` : ''}
${feedback ? `הערות המשתמש: ${feedback}` : ''}

כתוב הכל כאן. בעברית.`
            minLength = 1000
        } else if (stage === 3) {
            // AUDIENCE RESEARCH
            agentId = 'sayer'
            prompt = `משימת מחקר קהל יעד עבור "${businessName}".

קרא RESEARCH_STAGE1.md ו-RESEARCH_STAGE2.md.

חפש באינטרנט (Reddit, פורומים, רשתות חברתיות):
1. איפה קהל היעד מדבר על ${businessDesc}?
2. מהם הכאבים העיקריים? (5+)
3. מה אנשים משבחים/מתלוננים?
4. בנה 2-3 פרסונות מפורטות: שם, גיל, תפקיד, כאבים, מוטיבציות, איפה אונליין
${answers.targetAudience ? `קהל יעד שצוין: ${answers.targetAudience}` : ''}
${feedback ? `הערות המשתמש: ${feedback}` : ''}

כתוב הכל כאן. בעברית.`
            minLength = 1000
        } else if (stage === 4) {
            // CHANNEL ANALYSIS — reduce context by moving stage files out of workspace
            agentId = 'menateach'

            // Stage files saved outside workspace — compact summaries to fit 30K token limit
            const s1 = rd.stage1 ? rd.stage1.substring(0, 500) : ''
            const s2 = rd.stage2 ? rd.stage2.substring(0, 500) : ''
            const s3 = rd.stage3 ? rd.stage3.substring(0, 500) : ''

            prompt = `ניתוח ערוצים עבור "${businessName}". תמצית:
מתחרים: ${s1}
מילות מפתח: ${s2}
קהל: ${s3}

המלץ:
1. 3-5 ערוצים מומלצים + עדיפות
2. עלות ותדירות לכל ערוץ
3. פאנל: awareness→conversion
3. פאנל שיווק: awareness → consideration → conversion → retention
4. מה עושים ראשון? סדר עדיפויות
${answers.budget ? `תקציב: ${answers.budget}` : ''}
${answers.marketingGoals ? `מטרות: ${answers.marketingGoals}` : ''}
${feedback ? `הערות המשתמש: ${feedback}` : ''}

כתוב הכל כאן. בעברית.`
            minLength = 1000
        } else {
            return fail(c, 'Invalid stage (1-4)', 400)
        }

        const model = await getSubAgentModel(instanceId, agentId === 'menateach' ? 'menateach' : 'sayer')
        console.log(`Research stage ${stage} for ${businessName}, agent: ${agentId}, model: ${model}`)

        const b64Prompt = Buffer.from(prompt).toString('base64')
        const sessionId = `research-s${stage}-${Date.now()}`

        const output = await sshExec(instance.ip,
            `su - openclaw -c 'timeout 300 openclaw agent --agent ${agentId} --session-id ${sessionId} -m "$(echo ${b64Prompt} | base64 -d)" --json 2>&1'`,
            instance.rootPassword || undefined
        )

        let result = ''
        let isRateLimit = false
        try {
            const agentResult = JSON.parse(output)
            result = agentResult?.result?.payloads?.[0]?.text || ''
            if (output.includes('rate_limit') || output.includes('Rate limit')) {
                isRateLimit = true
            }
        } catch {
            result = output
            if (output.includes('rate_limit') || output.includes('Rate limit')) {
                isRateLimit = true
            }
        }

        // Fallback: check if agent saved to file
        if (result.length < minLength && (result.includes('.md') || result.includes('שמורה'))) {
            try {
                const fileContent = await sshExec(instance.ip,
                    `cat /home/openclaw/.openclaw/workspace/RESEARCH_STAGE${stage}.md 2>/dev/null || echo ""`,
                    instance.rootPassword || undefined
                )
                if (fileContent.length > minLength) result = fileContent
            } catch {}
        }

        if (!result || result.length < 500) {
            const msg = isRateLimit
                ? `rate limit — המודל הגיע לגבול השימוש (30K tokens). נסו: המתינו דקה / שנו מודל / שדרגו תוכנית API`
                : `שלב ${stage} נכשל — נסו שוב`
            console.error(`Stage ${stage} failed: ${msg}`)
            return fail(c, msg, 500)
        }

        // Save stage result OUTSIDE workspace (prevents token bloat)
        const b64Result = Buffer.from(result).toString('base64')
        await sshExec(instance.ip,
            `mkdir -p /home/openclaw/.openclaw/research-data && echo ${b64Result} | base64 -d > /home/openclaw/.openclaw/research-data/RESEARCH_STAGE${stage}.md && chown -R openclaw:openclaw /home/openclaw/.openclaw/research-data`,
            instance.rootPassword || undefined
        )

        // Save to DB
        const stageKey = `stage${stage}`
        await db.update(instances).set({
            researchData: { ...rd, [stageKey]: result, [`${stageKey}GeneratedAt`]: new Date().toISOString() } as any,
        }).where(eq(instances.id, instanceId))

        console.log(`Research stage ${stage} complete: ${result.length} chars`)
        return ok(c, {
            stage,
            result,
            nextStage: stage < 4 ? stage + 1 : null,
            model,
        }, `Stage ${stage} complete.`)
    } catch (err) {
        console.error('researchStage error:', err)
        return fail(c, `שלב המחקר נכשל`, 500)
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
