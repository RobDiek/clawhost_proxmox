/** Raw dump of the llm_responses/live result shape, to fix the parser. */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import type { MatehAgentRow } from '@/services/agentContext'
import { dfsPost } from '@/services/research/dataforseo/client'

async function main() {
    const agentId = process.argv[2] || 'mta_Un9jXRuf'
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as MatehAgentRow[]
    const instanceId = agent.vpsInstanceId
    const engine = process.argv[3] || 'chat_gpt'
    const model = process.argv[4] || 'gpt-4o'
    const params = { user_prompt: 'מהם הקרטונים הטובים ביותר למעבר דירה בישראל?', model_name: model, web_search: true, max_output_tokens: 1024 }
    const { result, cost } = await dfsPost<any>(instanceId, `ai_optimization/${engine}/llm_responses/live`, [params])
    console.log('cost=', cost)
    console.log('result JSON (1800):', JSON.stringify(result, null, 1).slice(0, 1800))
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e?.kind || '', e?.message || e); process.exit(1) })