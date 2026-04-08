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

// Model definitions with RAM requirements (updated April 2026)
// IDs must match Ollama registry names exactly (ollama.com/library)
// ramRequired = actual Ollama runtime memory (from `ollama show --modelfile` + overhead)
// 'tier' groups models: light (1-4GB), standard (6-12GB), heavy (16+GB)
const OLLAMA_MODELS = [
    // === Recommended for MATEH (Hebrew marketing) ===
    { id: 'qwen3.5:4b', name: 'Qwen 3.5 (4B)', ramRequired: 4, desc: 'דור חדש — עברית טובה, מהיר, חסכוני. מומלץ להתחלה', recommended: true, tier: 'light' },
    { id: 'gemma4', name: 'Gemma 4 (12B)', ramRequired: 9, desc: 'Google — הטוב ביותר באיכות. Vision + חשיבה + 128K context', tier: 'standard' },
    // === Good general-purpose ===
    { id: 'qwen3.5:9b', name: 'Qwen 3.5 (9B)', ramRequired: 7, desc: '#1 בבנצ\'מרקים בקטגוריה. 201 שפות, hybrid thinking', tier: 'standard' },
    { id: 'phi4:14b', name: 'Phi-4 (14B)', ramRequired: 10, desc: 'Microsoft — חזק בהיגיון, מתמטיקה וניתוח', tier: 'standard' },
    // === Lightweight ===
    { id: 'qwen3.5:0.8b', name: 'Qwen 3.5 (0.8B)', ramRequired: 1, desc: 'זעיר — סיווג, ניתוב, משימות פשוטות', tier: 'light' },
    { id: 'gemma4:e4b', name: 'Gemma 4 Edge (4B)', ramRequired: 4, desc: 'Google — קל, Vision, מתאים לעיבוד תמונות', tier: 'light' },
    // === Heavy (need 48GB+ — CCX43 plan) ===
    { id: 'qwen3.5:27b', name: 'Qwen 3.5 (27B)', ramRequired: 34, desc: 'עברית מצוינת, חשיבה עמוקה — דורש 64GB RAM', tier: 'heavy' },
    { id: 'devstral:24b', name: 'Devstral (24B)', ramRequired: 18, desc: 'Mistral — #1 קוד פתוח לפיתוח ו-agents', tier: 'heavy' },
    { id: 'mistral-small3.1:24b', name: 'Mistral Small 3.1 (24B)', ramRequired: 18, desc: '128K context, Vision, מהיר', tier: 'heavy' },
    { id: 'gemma4:31b', name: 'Gemma 4 (31B)', ramRequired: 22, desc: 'Google Flagship — הכי חזק, reasoning מתקדם', tier: 'heavy' },
]

// Calculate available RAM for Ollama models
// NOTE: plans.ts defines MATEH as 4GB — that's for plan auto-selection (peak usage).
// Runtime RAM is lower. These are RUNTIME estimates (what's actually consumed).
function calcAvailableRam(planRam: number, components: string[]): number {
    const systemOverhead = 1.0  // OS + kernel caches (Linux is lean)
    const gatewayRam = 0.3      // OpenClaw gateway + Node.js
    const automationRam = 0.5   // n8n / Activepieces (idle)
    const qdrantRam = 0.3       // Qdrant (Mem0) — small footprint when idle
    const agentRam = components.includes('mt') ? 1.5 : 0.3  // MATEH runtime (not peak)
    const ollamaDaemon = components.includes('ol') ? 0.2 : 0  // Ollama service itself
    return Math.max(0, planRam - systemOverhead - gatewayRam - automationRam - qdrantRam - agentRam - ollamaDaemon)
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
        const models = OLLAMA_MODELS.map(m => {
            const canRun = m.ramRequired <= availableRam
            const suggested = !canRun ? PLANS.find(p => calcAvailableRam(p.ram, components) >= m.ramRequired) : null
            return {
                ...m,
                canRun,
                installed: installedModels.some(im => im === m.id || im.startsWith(m.id + ':')),
                needsPlan: !canRun ? `נדרש ${m.ramRequired}GB — יש ${availableRam.toFixed(1)}GB` : null,
                suggestedPlan: suggested?.key || null,
                suggestedPlanName: suggested?.nameHe || null,
                suggestedPlanPrice: suggested?.priceIls || null,
            }
        })

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

        // Minimum RAM check — at least Business plan (8GB) recommended
        if (plan.ram < 8) {
            const suggestedPlan = PLANS.find(p => p.ram >= 8)
            return fail(c, JSON.stringify({
                error: 'plan_too_small',
                message: `Ollama דורש לפחות תוכנית עסקי (8GB RAM). התוכנית הנוכחית: ${plan.nameHe} (${plan.ram}GB).`,
                currentPlan: plan.key,
                suggestedPlan: suggestedPlan?.key || 'business',
                suggestedPlanName: suggestedPlan?.nameHe || 'עסקי',
                suggestedPrice: suggestedPlan?.priceIls || 169,
                currentPrice: plan.priceIls,
            }), 400)
        }

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
        `, instance.rootPassword || undefined, 300000)  // 5 min for download + install

        // Register Ollama provider in openclaw.json
        await registerOllamaProvider(instance.ip, instance.rootPassword || undefined)

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
        // Model ID is from our hardcoded whitelist — safe from injection
        const safeModelId = modelInfo.id.replace(/[^a-zA-Z0-9.:_-]/g, '')
        sshExec(instance.ip, `ollama pull "${safeModelId}" 2>&1`, instance.rootPassword || undefined, 1800000)
            .then(async () => {
                console.log(`Ollama model ${modelInfo.id} pulled on instance ${instanceId}`)
                // Register model in openclaw.json so agents can use it
                await registerOllamaModel(instance.ip, modelInfo.id, modelInfo.name, instance.rootPassword || undefined)
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

// DELETE /instances/:id/ollama/model — delete an installed model
export const deleteOllamaModel = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const { model } = await c.req.json<{ model: string }>()
        if (!model) return fail(c, 'Model required', 400)

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) return fail(c, 'Instance not ready', 400)

        // Safe model ID (from whitelist check)
        const safeModel = model.replace(/[^a-zA-Z0-9.:_-]/g, '')

        await sshExec(instance.ip, `ollama rm "${safeModel}" 2>&1`, instance.rootPassword || undefined)

        // Remove from openclaw.json
        await sshExec(instance.ip, `
            CONFIG="/home/openclaw/.openclaw/openclaw.json"
            if [ -f "$CONFIG" ]; then
                python3 -c "
import json
with open('$CONFIG') as f: d = json.load(f)
prov = d.get('models',{}).get('providers',{}).get('ollama',{})
prov['models'] = [m for m in prov.get('models',[]) if m.get('id') != '${safeModel}']
d.get('agents',{}).get('defaults',{}).get('models',{}).pop('ollama/${safeModel}', None)
with open('$CONFIG','w') as f: json.dump(d, f, indent=2)
"
                chown openclaw:openclaw "$CONFIG"
                systemctl restart openclaw-gateway 2>/dev/null || true
            fi
        `, instance.rootPassword || undefined).catch(() => {})

        return ok(c, { model: safeModel }, `${model} נמחק`)
    } catch (err) {
        console.error('deleteOllamaModel error:', err)
        return fail(c, 'Failed to delete model', 500)
    }
}

// Register Ollama as a provider in openclaw.json (creates models.providers.ollama section)
async function registerOllamaProvider(ip: string, password?: string): Promise<void> {
    try {
        await sshExec(ip, `
            CONFIG="/home/openclaw/.openclaw/openclaw.json"
            if [ -f "$CONFIG" ]; then
                python3 -c "
import json
with open('$CONFIG') as f: d = json.load(f)
d.setdefault('models', {}).setdefault('providers', {})['ollama'] = {
    'baseUrl': 'http://127.0.0.1:11434',
    'models': []
}
with open('$CONFIG', 'w') as f: json.dump(d, f, indent=2)
print('OK')
"
                chown openclaw:openclaw "$CONFIG"
            fi
        `, password)
        console.log(`Ollama provider registered in openclaw.json on ${ip}`)
    } catch (err) {
        console.error(`Failed to register Ollama provider on ${ip}:`, err)
    }
}

// Register a specific model in the ollama provider section of openclaw.json
async function registerOllamaModel(ip: string, modelId: string, modelName: string, password?: string): Promise<void> {
    try {
        // Escape for shell safety — modelId is from our whitelist but be safe
        const safeId = modelId.replace(/'/g, '')
        const safeName = modelName.replace(/'/g, '')
        await sshExec(ip, `
            CONFIG="/home/openclaw/.openclaw/openclaw.json"
            if [ -f "$CONFIG" ]; then
                python3 -c "
import json
with open('$CONFIG') as f: d = json.load(f)
prov = d.setdefault('models', {}).setdefault('providers', {}).setdefault('ollama', {'baseUrl': 'http://127.0.0.1:11434', 'models': []})
existing = [m['id'] for m in prov.get('models', [])]
if '${safeId}' not in existing:
    prov.setdefault('models', []).append({'id': '${safeId}', 'name': '${safeName}', 'api': 'ollama'})
# Also add to agents.defaults.models for easy selection
d.setdefault('agents', {}).setdefault('defaults', {}).setdefault('models', {})['ollama/${safeId}'] = {'alias': '${safeId}'.split(':')[0]}
with open('$CONFIG', 'w') as f: json.dump(d, f, indent=2)
print('OK')
"
                chown openclaw:openclaw "$CONFIG"
                systemctl restart openclaw-gateway 2>/dev/null || true
            fi
        `, password)
        console.log(`Ollama model ${modelId} registered in openclaw.json on ${ip}`)
    } catch (err) {
        console.error(`Failed to register Ollama model ${modelId} on ${ip}:`, err)
    }
}
