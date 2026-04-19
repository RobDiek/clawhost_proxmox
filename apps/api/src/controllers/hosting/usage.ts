import type { Context } from 'hono'
import { eq, and, gte, sql } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { Client } from 'ssh2'
import { readFileSync } from 'fs'
import { resolveUserId, getOwnedInstance } from './authHelper'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'

let sshKeyCache: Buffer | null = null
function getSSHKey(): Buffer {
    if (!sshKeyCache) sshKeyCache = readFileSync(SSH_KEY_PATH)
    return sshKeyCache
}

function sshExec(ip: string, command: string, password?: string, timeoutMs = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        let output = ''
        const timer = setTimeout(() => {
            conn.end()
            reject(new Error('SSH timeout'))
        }, timeoutMs)

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
        try { opts.privateKey = getSSHKey() } catch { if (!password) return reject(new Error('No SSH key')) }
        conn.connect(opts)
    })
}

// Model cost estimates (per 1K tokens, USD)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
    'anthropic/claude-opus-4-6': { input: 0.015, output: 0.075 },
    'anthropic/claude-sonnet-4-6': { input: 0.003, output: 0.015 },
    'anthropic/claude-haiku-4-5-20251001': { input: 0.0008, output: 0.004 },
    'openai/gpt-4o': { input: 0.0025, output: 0.01 },
    'openai/gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'google/gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
}

// GET /hosting/instances/:id/usage
export const getUsage = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) return fail(c, 'Instance not ready', 400)

        // Get model usage from OpenClaw's built-in session data
        const result = await sshExec(instance.ip, `
            su - openclaw -c '
                # Parse JSONL session files modified in last 30 days
                find ~/.openclaw -name "*.jsonl" -mtime -30 -type f 2>/dev/null | while read f; do
                    grep -h '"model"' "$f" 2>/dev/null
                done | node -e "
                    const lines = require('fs').readFileSync('/dev/stdin','utf-8').split('\\n').filter(Boolean);
                    const usage = {};
                    for (const line of lines) {
                        try {
                            const d = JSON.parse(line);
                            if (d.model && d.usage) {
                                const m = d.model;
                                if (!usage[m]) usage[m] = { calls: 0, inputTokens: 0, outputTokens: 0 };
                                usage[m].calls++;
                                usage[m].inputTokens += (d.usage.input_tokens || 0);
                                usage[m].outputTokens += (d.usage.output_tokens || 0);
                            }
                        } catch {}
                    }
                    console.log(JSON.stringify(usage));
                " 2>/dev/null || echo "{}"
            '
        `, instance.rootPassword || undefined)

        let modelUsage: Record<string, { calls: number; inputTokens: number; outputTokens: number }> = {}
        try {
            modelUsage = JSON.parse(result)
        } catch { /* empty */ }

        // Normalize model IDs: "claude-sonnet-4-6" → "anthropic/claude-sonnet-4-6"
        // Normalize model IDs to full provider/model format
        const MODEL_ALIASES: Record<string, string> = {
            'opus': 'anthropic/claude-opus-4-6',
            'sonnet': 'anthropic/claude-sonnet-4-6',
            'haiku': 'anthropic/claude-haiku-4-5-20251001',
            'gpt4o': 'openai/gpt-4o',
            'gpt4o-mini': 'openai/gpt-4o-mini',
            'flash': 'google/gemini-2.0-flash',
            // Partial version strings
            'claude-opus-4-6': 'anthropic/claude-opus-4-6',
            'claude-sonnet-4-6': 'anthropic/claude-sonnet-4-6',
            'claude-haiku-4-5': 'anthropic/claude-haiku-4-5-20251001',
            'claude-haiku-4-5-20251001': 'anthropic/claude-haiku-4-5-20251001',
            'claude-sonnet-4-5': 'anthropic/claude-sonnet-4-6',
            'claude-opus-4-5': 'anthropic/claude-opus-4-6',
            'gpt-4o': 'openai/gpt-4o',
            'gpt-4o-mini': 'openai/gpt-4o-mini',
        }

        function normalizeModelId(id: string): string {
            if (id.includes('/') && MODEL_COSTS[id]) return id
            if (MODEL_ALIASES[id]) return MODEL_ALIASES[id]
            // Try with provider prefix
            if (id.startsWith('claude-')) return 'anthropic/' + id
            if (id.startsWith('gpt-') || id.startsWith('o1')) return 'openai/' + id
            if (id.startsWith('gemini')) return 'google/' + id
            return id
        }

        // Calculate costs
        let totalCostUsd = 0
        let totalCostSonnetEquiv = 0
        const breakdown: Array<{
            model: string
            calls: number
            inputTokens: number
            outputTokens: number
            costUsd: number
        }> = []

        for (const [rawModel, data] of Object.entries(modelUsage)) {
            const model = normalizeModelId(rawModel)
            if (!MODEL_COSTS[model]) {
                console.warn(`Usage: unknown model "${rawModel}" → "${model}", using Sonnet cost fallback`)
            }
            const costs = MODEL_COSTS[model] || MODEL_COSTS['anthropic/claude-sonnet-4-6']
            const costUsd = (data.inputTokens / 1000 * costs.input) + (data.outputTokens / 1000 * costs.output)
            const sonnetCost = (data.inputTokens / 1000 * 0.003) + (data.outputTokens / 1000 * 0.015)

            totalCostUsd += costUsd
            totalCostSonnetEquiv += sonnetCost

            breakdown.push({
                model: model.split('/').pop() || model,
                calls: data.calls,
                inputTokens: data.inputTokens,
                outputTokens: data.outputTokens,
                costUsd: Math.round(costUsd * 100) / 100,
            })
        }

        const savedUsd = Math.max(0, totalCostSonnetEquiv - totalCostUsd)

        return ok(c, {
            period: '30d',
            totalCostUsd: Math.round(totalCostUsd * 100) / 100,
            savedVsSonnet: Math.round(savedUsd * 100) / 100,
            savingsPercent: totalCostSonnetEquiv > 0
                ? Math.round((1 - totalCostUsd / totalCostSonnetEquiv) * 100)
                : 0,
            breakdown: breakdown.sort((a, b) => b.costUsd - a.costUsd),
        }, 'Usage data')
    } catch (err) {
        console.error('getUsage error:', err)
        return fail(c, 'Failed to get usage', 500)
    }
}