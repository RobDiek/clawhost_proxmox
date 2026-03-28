import type { Context } from 'hono'
import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, join, relative } from 'path'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { Client } from 'ssh2'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'
const TEMPLATES_DIR = resolve(process.cwd(), '../../templates/mateh-system')

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
}

async function generateWithClaude(answers: OnboardingAnswers): Promise<{ userMd: string; brandMd: string }> {
    if (!ANTHROPIC_API_KEY) {
        return generateFallback(answers)
    }

    const prompt = `אתה מומחה שיווק דיגיטלי ישראלי. על סמך המידע הבא, צור שני קבצים:

מידע על העסק:
- שם העסק: ${answers.businessName}
- מה עושים: ${answers.businessDescription}
- קהל יעד: ${answers.targetAudience}
- מתחרים: ${answers.competitors}
- מטרות שיווק: ${answers.marketingGoals}
- תוכן נוכחי: ${answers.currentContent}
- אתגרים: ${answers.challenges}
- אתר: ${answers.websiteUrl || 'לא צוין'}

צור בדיוק שני קבצים:

===USER.MD===
(קובץ USER.md מלא עם כל הפרטים, מילות מפתח מומלצות, פלטפורמות מומלצות)

===BRAND.MD===
(קובץ BRAND.md מלא עם פוזיציונינג, קול, קהל יעד, עמודי תוכן, CTA)

כתוב בעברית טבעית. היה ספציפי ואקשנאבילי, לא גנרי.`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
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

    // Deploy openclaw.json
    const configTemplate = readFileSync(join(TEMPLATES_DIR, 'openclaw.json.template'), 'utf-8')
    const config = configTemplate
        .replace(/\{\{GATEWAY_TOKEN\}\}/g, gatewayToken)
        .replace(/\{\{SUBDOMAIN\}\}/g, subdomain)
    await sshWriteFile(ip, `${baseDir}/openclaw.json`, config, password)

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

        // Generate personalized files
        console.log(`Generating USER.md + BRAND.md for ${answers.businessName}...`)
        const { userMd, brandMd } = await generateWithClaude(answers)

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
