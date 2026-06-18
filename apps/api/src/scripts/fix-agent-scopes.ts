/** Correct the scrambled agent→campaign scope on shared account 5746845784,
 *  then re-run conversion-goal isolation so each brand's goal sits on its own
 *  campaign. Dry-run by default; pass --apply to write.
 *
 *   node --env-file=.env --import tsx src/scripts/fix-agent-scopes.ts [--apply]
 *
 * Corrected mapping (confirmed with operator 2026-06-18):
 *   Packing  mta_Un9jXRuf     → 23056338219 (Search) + 23184792647,23830252786 (PMax)
 *   Storage  mta_44f484a852   → 23056125738 (Search, was orphaned)
 *   Moving   mta_Xm8CfS3K     → 23066805751 (Search, already correct — untouched)
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { writeGoogleAdsConfig } from '@/services/agentContext'
import { ensureCampaignGoalIsolation } from '@/services/campaignGoalIsolation'

const INSTANCE = '44f484a852'
const DESIRED: Record<string, { name: string; campaignIds: string[] }> = {
    mta_Un9jXRuf: { name: 'Packing Station', campaignIds: ['23056338219', '23184792647', '23830252786'] },
    mta_44f484a852: { name: 'Storage station', campaignIds: ['23056125738'] },
    // Moving (mta_Xm8CfS3K) already correct → intentionally not listed.
}

async function main() {
    const apply = process.argv.includes('--apply')
    console.log(apply ? '⚙  APPLY mode\n' : '👀 DRY-RUN (pass --apply to write)\n')

    for (const [agentId, want] of Object.entries(DESIRED)) {
        const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
        if (!agent) { console.log(`✗ ${agentId} not found`); continue }
        const cfg: any = (agent.googleAdsConfig as any) || {}
        const current: string[] = cfg.scope?.campaignIds || []
        console.log(`— ${want.name} (${agentId})`)
        console.log(`    current: ${JSON.stringify(current)}`)
        console.log(`    desired: ${JSON.stringify(want.campaignIds)}`)
        if (JSON.stringify(current) === JSON.stringify(want.campaignIds)) { console.log('    = already correct\n'); continue }
        if (!apply) { console.log('    → would update scope.campaignIds\n'); continue }

        const nextCfg = { ...cfg, scope: { ...(cfg.scope || {}), mode: 'campaigns', campaignIds: want.campaignIds } }
        await writeGoogleAdsConfig(agent as any, INSTANCE, { config: nextCfg })
        const [after] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
        console.log(`    ✅ wrote → ${JSON.stringify((after?.googleAdsConfig as any)?.scope?.campaignIds)}\n`)
    }

    if (!apply) { console.log('dry-run complete. nothing written.'); process.exit(0) }

    // ── Re-run goal isolation on ALL THREE brands (Moving included — its goal
    //    is currently the mis-attached "Packing" goal and must be corrected). ──
    console.log('\n═══ RE-ISOLATING CONVERSION GOALS ═══')
    for (const agentId of ['mta_Un9jXRuf', 'mta_44f484a852', 'mta_Xm8CfS3K']) {
        const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
        if (!agent) continue
        try {
            const r = await ensureCampaignGoalIsolation(agent as any, { source: 'scope-correction-2026-06-18' })
            console.log(`— ${agent.name} (${agentId}): status=${r.status} reason=${r.reason}` +
                (r.campaignsIsolated ? ` isolated=${JSON.stringify(r.campaignsIsolated)}` : '') +
                (r.customGoalResource ? ` goal=${r.customGoalResource}` : '') +
                (r.taskId ? ` task=${r.taskId}` : ''))
        } catch (e) { console.log(`— ${agent.name} (${agentId}): ERROR ${(e as Error).message}`) }
    }
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })