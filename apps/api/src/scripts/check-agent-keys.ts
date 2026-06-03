/** READ-ONLY: show per-agent vs instance AI key isolation for an instance.
 *   node --env-file=.env --import tsx src/scripts/check-agent-keys.ts <instanceId>
 */
import { db } from '@/db'
import { matehAgents, instances } from '@/db/schema'
import { eq } from 'drizzle-orm'

function mask(v: unknown): string {
    if (!v || typeof v !== 'string') return '(null)'
    return v.slice(0, 7) + '…' + v.slice(-3) + ` [len ${v.length}]`
}

async function main() {
    const instanceId = process.argv[2] || '44f484a852'
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    console.log(`\n=== instance ${instanceId} ===`)
    console.log(`  aiProviderType: ${(inst as any)?.aiProviderType || '—'}`)
    console.log(`  aiProviderKey : ${mask((inst as any)?.aiProviderKey)}`)
    const agents = await db.select().from(matehAgents).where(eq(matehAgents.vpsInstanceId, instanceId))
    console.log(`\n=== ${agents.length} agents ===`)
    for (const a of agents) {
        console.log(`  ${a.isPrimary ? '★' : ' '} ${a.id} (${a.name || '—'})  type=${(a as any).aiProviderType || '—'}  key=${mask((a as any).aiProviderKey)}`)
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })