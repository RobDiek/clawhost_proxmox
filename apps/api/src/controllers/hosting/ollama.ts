import type { Context } from 'hono'
import { readFileSync } from 'fs'
import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { Client } from 'ssh2'
import { resolveUserId, getOwnedInstance } from './authHelper'
import { PLANS } from '@openclaw/shared'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'

function sshExec(ip: string, command: string, password?: string, timeoutMs = 60000): Promise<string> {
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
        try { opts.privateKey = readFileSync(SSH_KEY_PATH) } catch {}
        conn.connect(opts)
    })
}

// Model definitions with RAM requirements
const OLLAMA_MODELS = [
    { id: 'llama3.1:8b', name: 'Llama 3.1 (8B)', ramRequired: 6, desc: 'מודל כללי — עברית סבירה', recommended: true },
    { id: 'mistral:7b', name: 'Mistral (7B)', ramRequired: 5, desc: 'מהיר — אנגלית מצוינת, עברית בסיסית' },
    { id: 'codellama:7b', name: 'CodeLlama (7B)', ramRequired: 5, desc: 'מיועד לקוד — לא מתאים לעברית' },
    { id: 'gemma2:9b', name: 'Gemma 2 (9B)', ramRequired: 7, desc: 'Google — איכות גבוהה, צורך הרבה RAM' },
    { id: 'qwen2.5:7b', name: 'Qwen 2.5 (7B)', ramRequired: 5, desc: 'טוב בעברית — מומלץ למשימות פנימיות' },
    { id: 'phi4-mini', name: 'Phi-4 Mini (3.8B)', ramRequired: 3, desc: 'קטן ומהיר — מומלץ לסיווג ומשימות פשוטות' },
    { id: 'llama3.1:70b', name: 'Llama 3.1 (70B)', ramRequired: 42, desc: 'חזק מאוד — דורש שרת ייעודי (32GB+ RAM)' },
]

// Calculate available RAM for Ollama (total - system - services)
function calcAvailableRam(planRam: number, components: string[]): number {
    const systemOverhead = 1.0  // OS + Docker
    const gatewayRam = 0.3      // OpenClaw gateway
    const automationRam = 0.5   // n8n / Activepieces
    const qdrantRam = 0.3       // Qdrant (Mem0)
    const agentRam = components.includes('mt') ? 1.0 : 0.3  // MATEH needs more
    return Math.max(0, planRam - systemOverhead - gatewayRam - automationRam - qdrantRam - agentRam)
}

// GET /instances/:id/ollama/status — check Ollama state + available models
export const getOllamaStatus = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) return fail(c, 'Instance not ready', 400)

        const components = (instance.selectedComponents as string[]) || []
        const plan = PLANS.find(p => p.key === instance.planKey) || PLANS[0]
        const availableRam = calcAvailableRam(plan.ram, components)
        const ollamaSelected = components.includes('ol')

        // Check if Ollama is actually installed on VPS
        let installed = false
        let running = false
        let installedModels: string[] = []

        if (ollamaSelected) {
            try {
                const status = await sshExec(instance.ip, 'systemctl is-active ollama 2>/dev/null && ollama list 2>/dev/null | tail -n +2 | awk \'{print $1}\'', instance.rootPassword || undefined)
                running = status.includes('active')
                installedModels = status.split('\n').filter(l => l && !l.includes('active') && !l.includes('inactive')).map(l => l.trim()).filter(Boolean)
                installed = true
            } catch {
                // SSH failed or Ollama not found
            }
        }

        // Build model list with availability info
        const models = OLLAMA_MODELS.map(m => ({
            ...m,
            canRun: m.ramRequired <= availableRam,
            installed: installedModels.some(im => im.startsWith(m.id.split(':')[0])),
            needsPlan: !ollamaSelected ? 'Ollama לא נבחר — נדרש שדרוג תוכנית' :
                        m.ramRequired > availableRam ? `נדרש ${m.ramRequired}GB RAM — יש ${availableRam.toFixed(1)}GB פנוי` : null,
            suggestedPlan: m.ramRequired > availableRam ?
                PLANS.find(p => calcAvailableRam(p.ram, components) >= m.ramRequired)?.key || null : null,
        }))

        return ok(c, {
            installed,
            running,
            ollamaSelected,
            currentPlan: {
                key: plan.key,
                name: plan.nameHe,
                totalRam: plan.ram,
                availableRam: Math.round(availableRam * 10) / 10,
            },
            installedModels,
            models,
        }, 'Ollama status')
    } catch (err) {
        console.error('getOllamaStatus error:', err)
        return fail(c, 'Failed to get Ollama status', 500)
    }
}

// POST /instances/:id/ollama/install — install Ollama on VPS (if not already)
export const installOllama = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) return fail(c, 'Instance not ready', 400)

        const components = (instance.selectedComponents as string[]) || []
        const plan = PLANS.find(p => p.key === instance.planKey) || PLANS[0]
        const availableRam = calcAvailableRam(plan.ram, components)

        // Minimum 3GB free RAM for any Ollama model
        if (availableRam < 3) {
            const suggestedPlan = PLANS.find(p => calcAvailableRam(p.ram, components) >= 5)
            return fail(c, JSON.stringify({
                error: 'insufficient_ram',
                message: `אין מספיק RAM. יש ${availableRam.toFixed(1)}GB פנוי, נדרש לפחות 3GB.`,
                currentPlan: plan.key,
                suggestedPlan: suggestedPlan?.key || 'pro',
                suggestedPlanName: suggestedPlan?.nameHe || 'פרו',
                suggestedPrice: suggestedPlan?.priceIls || 349,
                currentPrice: plan.priceIls,
            }), 400)
        }

        // Install Ollama via SSH
        await sshExec(instance.ip, `
            if ! command -v ollama &> /dev/null; then
                curl -fsSL https://ollama.com/install.sh | sh
                systemctl enable ollama
                systemctl start ollama
            else
                systemctl start ollama 2>/dev/null
            fi
        `, instance.rootPassword || undefined, 120000)

        // Update components in DB if not already included
        if (!components.includes('ol')) {
            const newComponents = [...components, 'ol']
            await db.update(instances).set({
                selectedComponents: newComponents as any,
            }).where(eq(instances.id, instanceId))
        }

        return ok(c, null, 'Ollama installed')
    } catch (err) {
        console.error('installOllama error:', err)
        return fail(c, 'Failed to install Ollama', 500)
    }
}

// POST /instances/:id/ollama/pull — pull a specific model
export const pullOllamaModel = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{ model: string }>()
        if (!body.model) return fail(c, 'Model required', 400)

        // Validate model is in our list
        const modelInfo = OLLAMA_MODELS.find(m => m.id === body.model)
        if (!modelInfo) return fail(c, 'Unknown model', 400)

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) return fail(c, 'Instance not ready', 400)

        const components = (instance.selectedComponents as string[]) || []
        const plan = PLANS.find(p => p.key === instance.planKey) || PLANS[0]
        const availableRam = calcAvailableRam(plan.ram, components)

        // Check RAM sufficiency
        if (modelInfo.ramRequired > availableRam) {
            const suggestedPlan = PLANS.find(p => calcAvailableRam(p.ram, components) >= modelInfo.ramRequired)
            return fail(c, JSON.stringify({
                error: 'insufficient_ram',
                message: `${modelInfo.name} דורש ${modelInfo.ramRequired}GB RAM. יש ${availableRam.toFixed(1)}GB פנוי.`,
                currentPlan: plan.key,
                suggestedPlan: suggestedPlan?.key || 'developer',
                suggestedPlanName: suggestedPlan?.nameHe || 'מפתח',
                suggestedPrice: suggestedPlan?.priceIls || 599,
                currentPrice: plan.priceIls,
                priceDiff: (suggestedPlan?.priceIls || 599) - plan.priceIls,
            }), 400)
        }

        // Check Ollama is running
        const isRunning = await sshExec(instance.ip, 'systemctl is-active ollama 2>/dev/null', instance.rootPassword || undefined)
        if (!isRunning.includes('active')) {
            await sshExec(instance.ip, 'systemctl start ollama 2>/dev/null', instance.rootPassword || undefined)
            await new Promise(r => setTimeout(r, 3000))
        }

        // Pull model in background (can take minutes for large models)
        sshExec(instance.ip, `ollama pull '${modelInfo.id.replace(/'/g, '')}' 2>&1`, instance.rootPassword || undefined, 600000)
            .then(() => {
                console.log(`Ollama model ${modelInfo.id} pulled on instance ${instanceId}`)
            })
            .catch((err) => {
                console.error(`Ollama pull failed on ${instanceId}:`, err)
            })

        return ok(c, {
            model: modelInfo.id,
            ramRequired: modelInfo.ramRequired,
            status: 'pulling',
        }, `מוריד ${modelInfo.name}... זה עלול לקחת כמה דקות.`)
    } catch (err) {
        console.error('pullOllamaModel error:', err)
        return fail(c, 'Failed to pull model', 500)
    }
}
