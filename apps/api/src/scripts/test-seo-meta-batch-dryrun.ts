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
    // --agent <agentId>: pick a specific WP integration row (an instance can host
    // multiple agents, each with its own WordPress site).
    const agentFlag = process.argv.indexOf('--agent')
    const agentId = agentFlag !== -1 ? process.argv[agentFlag + 1] : undefined

    console.log('=== WordPress-connected instances ===')
    const wpRows = await db.select().from(agentIntegrations).where(eq(agentIntegrations.integrationType, 'wordpress'))
    if (wpRows.length === 0) {
        console.log('(none — no agent_integrations rows with integration_type=wordpress)')
    }
    for (const r of wpRows) {
        const cfg = (r.config as Record<string, unknown> | null) || {}
        console.log(`• instance=${r.instanceId} agent=${r.agentId} status=${r.status} url=${cfg.url} hasAppPw=${'appPassword' in cfg} hasPw=${'password' in cfg}`)
    }

    const cfg = await loadWpConfig(targetId, agentId)
    if (!cfg) {
        console.log('loadWpConfig → null (no usable WP config for this instance). Pass a different instanceId as argv[2].')
        process.exit(0)
    }
    console.log(`loadWpConfig OK → url=${cfg.url} user=${cfg.user}`)

    // --authcheck: probe auth-required endpoints to tell apart "auth broken"
    // (rest_not_logged_in everywhere) from "permission nuance".
    if (process.argv.includes('--authcheck')) {
        const base = cfg.url.replace(/\/+$/, '')
        const auth = 'Basic ' + Buffer.from(`${cfg.user}:${cfg.appPassword.replace(/\s+/g, '')}`).toString('base64')
        const hit = async (path: string) => {
            const r = await fetch(base + path, { headers: { Authorization: auth } })
            const t = await r.text()
            console.log(`GET ${path} -> ${r.status} ${t.slice(0, 150)}`)
        }
        console.log(`\n=== authcheck for ${targetId} (${base}, user=${cfg.user}) ===`)
        await hit('/wp-json/wp/v2/users/me')   // any logged-in user
        await hit('/wp-json/wp/v2/plugins')    // manage_options
        await hit('/wp-json/wp/v2/settings')   // manage_options
        process.exit(0)
    }

    // --probe-meta <id>: try several Yoast/Rank Math write strategies on one
    // page and read back, to find which (if any) actually persists via REST.
    const probeFlag = process.argv.indexOf('--probe-meta')
    if (probeFlag !== -1 && process.argv[probeFlag + 1]) {
        const id = Number(process.argv[probeFlag + 1])
        const base = cfg.url.replace(/\/+$/, '')
        const auth = 'Basic ' + Buffer.from(`${cfg.user}:${cfg.appPassword}`).toString('base64')
        const readBack = async (): Promise<string> => {
            const r = await fetch(`${base}/wp-json/wp/v2/pages/${id}?context=edit&_fields=yoast_head_json,meta`, { headers: { Authorization: auth } })
            const j = await r.json() as any
            return `yoast.desc=${JSON.stringify(j?.yoast_head_json?.description)} meta._yoast=${JSON.stringify(j?.meta?._yoast_wpseo_metadesc)} meta.rankmath=${JSON.stringify(j?.meta?.rank_math_description)}`
        }
        const strategies: Array<{ label: string; body: unknown }> = [
            { label: 'meta._yoast_wpseo_metadesc', body: { meta: { _yoast_wpseo_metadesc: 'CLAWFLOW PROBE A — תיאור בדיקה' } } },
            { label: 'meta.rank_math_description', body: { meta: { rank_math_description: 'CLAWFLOW PROBE B — תיאור בדיקה' } } },
            { label: 'yoast_meta wrapper', body: { yoast_meta: { yoast_wpseo_metadesc: 'CLAWFLOW PROBE C — תיאור בדיקה' } } },
        ]
        console.log(`\n=== probe-meta page ${id} (${base}) ===`)
        console.log('before:', await readBack())
        for (const s of strategies) {
            const r = await fetch(`${base}/wp-json/wp/v2/pages/${id}`, {
                method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(s.body),
            })
            console.log(`\n[${s.label}] POST status=${r.status}`)
            console.log('  after:', await readBack())
        }
        process.exit(0)
    }

    // --write <id>: perform a REAL single-page write + read-back to verify
    // writeMeta persists into Yoast/Rank Math. e.g. `... 44f484a852 --write 152`
    const writeFlag = process.argv.indexOf('--write')
    if (writeFlag !== -1 && process.argv[writeFlag + 1]) {
        const id = Number(process.argv[writeFlag + 1])
        console.log(`\n=== REAL WRITE test: ${targetId} page/post id=${id} ===`)
        const before = await fetch(`${cfg.url.replace(/\/+$/, '')}/wp-json/wp/v2/pages/${id}?_fields=id,link,yoast_head_json,meta`, {
            headers: { Authorization: 'Basic ' + Buffer.from(`${cfg.user}:${cfg.appPassword}`).toString('base64') },
        }).then(r => r.ok ? r.json() : null).catch(() => null) as any
        console.log(`before: yoast="${before?.yoast_head_json?.description || ''}" rankmath="${before?.meta?.rank_math_description || ''}"`)

        const res = await runSeoMetaBatch(targetId, { agentId, onlyIds: [id] })
        console.log(`write result: candidates=${res.candidates} updated=${res.updated.length} failures=${res.failures.length}${res.error ? ' error=' + res.error : ''}`)
        for (const u of res.updated) console.log(`  wrote meta(${u.metaDescription.length}): ${u.metaDescription}`)
        for (const f of res.failures) console.log(`  FAIL #${f.id}: ${f.error}`)

        const after = await fetch(`${cfg.url.replace(/\/+$/, '')}/wp-json/wp/v2/pages/${id}?_fields=id,link,yoast_head_json,meta`, {
            headers: { Authorization: 'Basic ' + Buffer.from(`${cfg.user}:${cfg.appPassword}`).toString('base64') },
        }).then(r => r.ok ? r.json() : null).catch(() => null) as any
        console.log(`after:  yoast="${after?.yoast_head_json?.description || ''}" rankmath="${after?.meta?.rank_math_description || ''}"`)
        process.exit(0)
    }

    // --write-all: REAL batch write of every weak candidate (no dryRun).
    if (process.argv.includes('--write-all')) {
        console.log(`\n=== REAL WRITE-ALL for ${targetId} (agent=${agentId || 'first'}) ===`)
        const res = await runSeoMetaBatch(targetId, { agentId })
        console.log(`scanned=${res.scanned} candidates=${res.candidates} updated=${res.updated.length} failures=${res.failures.length}${res.error ? ' error=' + res.error : ''} authError=${res.authError}`)
        for (const u of res.updated) console.log(`  ✓ [${u.type}#${u.id}] ${u.title} — meta(${u.metaDescription.length})`)
        for (const f of res.failures) console.log(`  ✗ [${f.type}#${f.id}] ${f.error}`)
        process.exit(0)
    }

    console.log(`\n=== Dry-run for instance ${targetId} ===`)

    const res = await runSeoMetaBatch(targetId, { agentId, dryRun: true })
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