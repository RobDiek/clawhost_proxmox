/** List available models per LLM engine (DFS /models endpoints) to pick search-capable ones. */
import { getDfsAuthHeader } from '@/services/research/dataforseo/client'
async function main() {
    const instanceId = process.argv[2] || '44f484a852'
    const auth = await getDfsAuthHeader(instanceId)
    for (const engine of ['chat_gpt', 'gemini', 'claude', 'perplexity']) {
        try {
            const res = await fetch(`https://api.dataforseo.com/v3/ai_optimization/${engine}/llm_responses/models`, { headers: { Authorization: auth } })
            const j = await res.json() as any
            const items = j?.tasks?.[0]?.result || j?.tasks?.[0]?.result?.[0]?.items || []
            const names: any[] = []
            const walk = (x: any) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { if (x.model_name || x.model || x.name) names.push(x.model_name || x.model || x.name); Object.values(x).forEach(walk) } }
            walk(items)
            console.log(`\n=== ${engine} (status ${j?.status_code}) ===`)
            console.log(Array.from(new Set(names)).join(', ') || JSON.stringify(items).slice(0, 400))
        } catch (e) { console.log(`${engine}: ERR ${(e as Error).message}`) }
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e?.message || e); process.exit(1) })