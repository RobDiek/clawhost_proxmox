/**
 * SEO meta batch dry-run smoke test (SEO/content sprint — Item 2).
 *
 * Lists every WordPress-connected instance, then for a target instance runs
 * runSeoMetaBatch with dryRun:true — exercising the full list → filter →
 * generate path WITHOUT writing anything back to WordPress. Used to confirm a
 * tenant's WP REST + SEO-plugin setup before enabling real writes.
 *
 *   npx tsx src/scripts/test-seo-meta-batch-dryrun.ts [instanceId]
 *
 * Default target: 44f484a852 (admin canary).
 */
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { agentIntegrations } from '@/db/schema'
import { runSeoMetaBatch, loadWpConfig } from '@/services/seoMetaBatch'

async function main() {
    const targetId = process.argv[2] || '44f484a852'

    console.log('=== WordPress-connected instances ===')
    const wpRows = await db.select().from(agentIntegrations).where(eq(agentIntegrations.integrationType, 'wordpress'))
    if (wpRows.length === 0) {
        console.log('(none — no agent_integrations rows with integration_type=wordpress)')
    }
    for (const r of wpRows) {
        const cfg = (r.config as Record<string, unknown> | null) || {}
        console.log(`• instance=${r.instanceId} agent=${r.agentId} status=${r.status} url=${cfg.url} hasAppPw=${'appPassword' in cfg} hasPw=${'password' in cfg}`)
    }

    console.log(`\n=== Dry-run for instance ${targetId} ===`)
    const cfg = await loadWpConfig(targetId)
    if (!cfg) {
        console.log('loadWpConfig → null (no usable WP config for this instance). Pass a different instanceId as argv[2].')
        process.exit(0)
    }
    console.log(`loadWpConfig OK → url=${cfg.url} user=${cfg.user}`)

    const res = await runSeoMetaBatch(targetId, { dryRun: true })
    console.log('\n--- result ---')
    console.log(`integrationMissing : ${res.integrationMissing}`)
    console.log(`detectorAvailable  : ${res.detectorAvailable}  (could read Yoast/RankMath meta via REST)`)
    console.log(`scanned            : ${res.scanned} posts+pages`)
    console.log(`candidates (weak)  : ${res.candidates}`)
    console.log(`generated (dryRun) : ${res.updated.length}`)
    console.log(`failures           : ${res.failures.length}`)
    if (res.error) console.log(`error              : ${res.error}`)

    console.log('\n--- would-update preview (first 5) ---')
    for (const u of res.updated.slice(0, 5)) {
        console.log(`• [${u.type}#${u.id}] ${u.title}`)
        console.log(`    ${u.link}`)
        console.log(`    meta(${u.metaDescription.length}): ${u.metaDescription}`)
    }
    if (res.failures.length) {
        console.log('\n--- failures (first 5) ---')
        for (const f of res.failures.slice(0, 5)) console.log(`• [${f.type}#${f.id}] ${f.error}`)
    }

    process.exit(0)
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })