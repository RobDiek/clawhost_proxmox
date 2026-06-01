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
import { isSeoMetaBatchTask } from '@/services/monthlyTaskExecutor'

async function main() {
    const targetId = process.argv[2] || '44f484a852'
    // --agent <agentId>: pick a specific WP integration row (an instance can host
    // multiple agents, each with its own WordPress site).
    const agentFlag = process.argv.indexOf('--agent')
    const agentId = agentFlag !== -1 ? process.argv[agentFlag + 1] : undefined

    // --scan-tasks: load the agent's monthlyPlan and report which real tasks the
    // executor would route to runSeoMetaBatchAdapter (does Opus phrasing match?).
    if (process.argv.includes('--scan-tasks')) {
        const { resolveAgentById, resolvePrimaryAgent, readResearchData } = await import('@/services/agentContext')
        const ag = agentId ? await resolveAgentById(targetId, agentId) : await resolvePrimaryAgent(targetId)
        const rd: any = (await readResearchData(ag as any, targetId)) || {}
        const tasks: any[] = rd?.monthlyPlan?.tasks || []
        console.log(`\n=== scan-tasks ${targetId} agent=${agentId || 'primary'} — ${tasks.length} tasks ===`)
        const matched = tasks.filter(t => isSeoMetaBatchTask(t))
        console.log(`isSeoMetaBatchTask matches: ${matched.length}`)
        for (const t of matched) console.log(`  ✓ [${t.type}/${t.channel}/${t.status}] ${t.title}`)
        // also show seo/website tasks that mention meta but did NOT match, to spot misses
        const near = tasks.filter(t => !isSeoMetaBatchTask(t) && /meta|תיאור/i.test(`${t.title} ${t.summary}`))
        if (near.length) {
            console.log(`\nnear-misses (mention meta but not routed):`)
            for (const t of near) console.log(`  · [${t.type}/${t.channel}] ${t.title}`)
        }
        process.exit(0)
    }

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

    // --schema-dryrun | --schema-write <id> | --schema-write-all: exercise the
    // JSON-LD schema batch (writes _clawflow_schema_jsonld via companion v1.9.0).
    if (process.argv.some(a => a.startsWith('--schema'))) {
        const { runSeoSchemaBatch } = await import('@/services/seoSchemaBatch')
        const wf = process.argv.indexOf('--schema-write')
        const single = wf !== -1 && process.argv[wf + 1] ? Number(process.argv[wf + 1]) : undefined
        const dry = process.argv.includes('--schema-dryrun')
        console.log(`\n=== schema batch ${targetId} agent=${agentId || 'first'} dry=${dry} single=${single ?? 'all'} ===`)
        const res = await runSeoSchemaBatch(targetId, { agentId, dryRun: dry, onlyIds: single ? [single] : undefined })
        console.log(`scanned=${res.scanned} candidates=${res.candidates} updated=${res.updated.length} failures=${res.failures.length} authError=${res.authError}${res.error ? ' error=' + res.error : ''}`)
        for (const u of res.updated) console.log(`  ✓ [${u.type}#${u.id}] ${u.title} — ${u.types.join(', ')}`)
        for (const f of res.failures) console.log(`  ✗ [${f.type}#${f.id}] ${f.error}`)
        process.exit(0)
    }

    // --links-dryrun | --links-write [id] | --links-write-all: internal linking.
    if (process.argv.some(a => a.startsWith('--links'))) {
        const { runInternalLinks } = await import('@/services/seoInternalLinks')
        const wf = process.argv.indexOf('--links-write')
        const single = wf !== -1 && process.argv[wf + 1] && /^\d+$/.test(process.argv[wf + 1]) ? Number(process.argv[wf + 1]) : undefined
        const dry = process.argv.includes('--links-dryrun')
        console.log(`\n=== internal links ${targetId} agent=${agentId || 'first'} dry=${dry} single=${single ?? 'all'} ===`)
        const res = await runInternalLinks(targetId, { agentId, dryRun: dry, onlyIds: single ? [single] : undefined })
        console.log(`scanned=${res.scanned} candidates=${res.candidates} updated=${res.updated.length} failures=${res.failures.length} authError=${res.authError}${res.error ? ' error=' + res.error : ''}`)
        for (const u of res.updated) { console.log(`  ✓ #${u.id} ${u.title}`); for (const i of u.inserted) console.log(`      "${i.anchor}" → ${i.toUrl}`) }
        for (const f of res.failures) console.log(`  ✗ #${f.id} ${f.error}`)
        process.exit(0)
    }

    // --gh <op> [--write]: GitHub static-site retrofit. op = meta|schema|links|slug.
    const ghFlag = process.argv.indexOf('--gh')
    if (ghFlag !== -1 && process.argv[ghFlag + 1]) {
        const { runSeoGithubBatch, loadGithubConfig } = await import('@/services/seoGithubBatch')
        const op = process.argv[ghFlag + 1] as 'meta' | 'schema' | 'links' | 'slug'
        const write = process.argv.includes('--write')
        const ghc = await loadGithubConfig(targetId, agentId)
        console.log(`\n=== GitHub ${op} ${targetId} write=${write} ===`)
        console.log('githubConfig:', ghc ? `${ghc.repo}@${ghc.branch}:${ghc.contentPath}` : 'NONE')
        if (!ghc) process.exit(0)
        const res = await runSeoGithubBatch(targetId, op, { agentId, dryRun: !write })
        console.log(`scanned=${res.scanned} candidates=${res.candidates} changed=${res.changed.length} proposals=${res.proposals.length} failures=${res.failures.length}${res.error ? ' error=' + res.error : ''}`)
        if (res.prUrl) console.log('PR:', res.prUrl)
        for (const c of res.changed) console.log(`  ✓ ${c.path} — ${c.detail}`)
        for (const p of res.proposals) console.log(`  → ${p.path} : ${p.suggestedSlug}`)
        for (const f of res.failures) console.log(`  ✗ ${f.path} — ${f.error}`)
        process.exit(0)
    }

    // --slugs: propose Latin slugs + 301s for %-encoded/Hebrew URLs (read-only).
    if (process.argv.includes('--slugs')) {
        const { proposeSlugs } = await import('@/services/seoSlugPropose')
        console.log(`\n=== slug proposals ${targetId} agent=${agentId || 'first'} ===`)
        const res = await proposeSlugs(targetId, { agentId })
        console.log(`scanned=${res.scanned} candidates=${res.candidates} proposals=${res.proposals.length}${res.error ? ' error=' + res.error : ''}`)
        for (const p of res.proposals.slice(0, 20)) console.log(`  "${p.title}"\n     ${p.currentSlug || p.oldUrl}\n     → ${p.suggestedSlug}`)
        process.exit(0)
    }

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