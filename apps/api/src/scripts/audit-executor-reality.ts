/**
 * WS-4 — Executor Reality Harness (roadmap/23).
 *
 * READ-ONLY by default. For one tenant, runs the SAME classifier + connected-stack
 * the executor uses, and buckets every monthly-plan task into:
 *
 *   PASS     — auto capability AND its required integration is connected → on
 *              אישור the executor performs a real mutation.
 *   BRIEF    — intentionally propose-only / draft (slug 301, ads.analysis,
 *              site.perf) OR a needs-subscription/needs-connect honest CTA.
 *   GAP      — badged auto (non-external) but the executor is NOT wired for the
 *              connected channel → "displayed-auto-but-executor-gap". Acceptance
 *              criterion = 0 of these except intentional propose-only.
 *   EXTERNAL — genuine off-platform outreach/interview → honest manual.
 *
 * With --gh-dry it ALSO dry-runs the GitHub static-site ops (meta/schema/links/
 * slug/body_expand/image_alt/answer_first) to prove the mutation path is wired
 * without writing anything (no PR opened).
 *
 *   node --env-file=.env --import tsx src/scripts/audit-executor-reality.ts <instanceId> [--agent <agentId>] [--gh-dry]
 *
 * Default target: flow (a3d2b01d02) — the GitHub + Google-Ads dogfood tenant.
 */
import { resolveAgentById, resolvePrimaryAgent, readResearchData } from '@/services/agentContext'
import { resolveConnectedStack, type ConnectedStack } from '@/services/connectedStack'
import { classifyTask, CAPABILITIES, type Autonomy } from '@/services/executorCapabilities'
import { isExternalOutreachTask } from '@/services/monthlyTaskExecutor'

// Mirror of monthlyPlanAutoAnnotate.STACK_HAS / requiresSatisfied (not exported there).
const STACK_HAS: Record<string, (s: ConnectedStack) => boolean> = {
    wordpress: s => s.wordpress, github: s => s.github, google_ads: s => s.googleAdsExecutable,
    gtm: s => s.gtm, ga4: s => s.ga4, meta: s => s.meta, gbp: s => s.gbp, whatsapp: s => s.whatsapp,
    api_key: s => s.apiKey, dataforseo: () => false,
}
function requiresSatisfied(requires: string[], stack: ConnectedStack): boolean {
    return requires.every(entry => entry.split('|').some(tok => (STACK_HAS[tok.trim()] || (() => false))(stack)))
}

type Bucket = 'PASS' | 'BRIEF' | 'GAP' | 'EXTERNAL'

async function main() {
    const instanceId = process.argv[2] || 'a3d2b01d02'
    const agentFlag = process.argv.indexOf('--agent')
    const agentId = agentFlag !== -1 ? process.argv[agentFlag + 1] : undefined
    const ghDry = process.argv.includes('--gh-dry')

    const agent = agentId ? await resolveAgentById(instanceId, agentId) : await resolvePrimaryAgent(instanceId)
    const stack = await resolveConnectedStack(agent as any, instanceId)
    const rd: any = (await readResearchData(agent as any, instanceId)) || {}
    const tasks: any[] = rd?.monthlyPlan?.tasks || []

    console.log(`\n=== Executor Reality — instance=${instanceId} agent=${agent?.id || 'primary/none'} ===`)
    console.log(`stack: wp=${stack.wordpress} github=${stack.github}${stack.githubRepo ? '(' + stack.githubRepo + ')' : ''} ads=${stack.googleAdsExecutable} gtm=${stack.gtm} ga4=${stack.ga4} meta=${stack.meta} apiKey=${stack.apiKey}`)
    console.log(`tasks: ${tasks.length}\n`)

    const rows: Array<{ n: number; bucket: Bucket; cap: string; autonomy: Autonomy; title: string; note: string }> = []
    const counts: Record<Bucket, number> = { PASS: 0, BRIEF: 0, GAP: 0, EXTERNAL: 0 }

    tasks.forEach((t, i) => {
        const title = (t.title || '').slice(0, 64)
        let external = false
        try { external = isExternalOutreachTask(t) } catch { /* skip */ }
        if (external) { rows.push({ n: i + 1, bucket: 'EXTERNAL', cap: 'manual', autonomy: 'manual', title, note: 'off-platform outreach' }); counts.EXTERNAL++; return }

        const { capabilityId, autonomy } = classifyTask(t)
        const cap = CAPABILITIES.find(c => c.id === capabilityId)
        const ready = !!cap && requiresSatisfied(cap.requires, stack)

        let bucket: Bucket
        let note = ''
        if (autonomy === 'manual' || capabilityId === 'manual') {
            // Not badged auto → honest manual brief. Not a "displayed-auto-but-gap".
            bucket = 'BRIEF'; note = 'unmatched → manual brief'
        } else if (autonomy === 'propose_only') {
            bucket = 'BRIEF'; note = `propose-only (${cap?.requires.join('|')}${ready ? '' : ' — not connected'})`
        } else if (ready) {
            bucket = 'PASS'; note = `requires ${cap?.requires.join('|')} ✓`
        } else if (cap && cap.requires.includes('dataforseo')) {
            bucket = 'BRIEF'; note = 'needs DataForSEO subscription (intentional)'
        } else {
            // auto_write/auto_partial badged but required integration NOT connected.
            bucket = 'GAP'; note = `BADGED AUTO but requires ${cap?.requires.join('|')} — none connected`
        }
        rows.push({ n: i + 1, bucket, cap: capabilityId, autonomy, title, note })
        counts[bucket]++
    })

    for (const b of ['GAP', 'PASS', 'BRIEF', 'EXTERNAL'] as Bucket[]) {
        const arr = rows.filter(r => r.bucket === b)
        if (!arr.length) continue
        console.log(`----- ${b} (${arr.length}) -----`)
        for (const r of arr) console.log(`  ${String(r.n).padStart(2)}. [${r.autonomy}] ${r.cap.padEnd(20)} ${r.title}  · ${r.note}`)
        console.log('')
    }

    console.log(`===== SUMMARY (${tasks.length} tasks) =====`)
    console.log(`  PASS=${counts.PASS} · BRIEF=${counts.BRIEF} · GAP=${counts.GAP} · EXTERNAL=${counts.EXTERNAL}`)
    console.log(`  ACCEPTANCE: badged-auto-but-gap = ${counts.GAP}  (target: 0)`)
    if (counts.GAP > 0) {
        console.log('  GAP tasks (must close or re-route):')
        for (const r of rows.filter(r => r.bucket === 'GAP')) console.log(`    #${r.n} ${r.cap} — ${r.title}`)
    }

    if (ghDry) {
        const { runSeoGithubBatch, loadGithubConfig } = await import('@/services/seoGithubBatch')
        const ghc = await loadGithubConfig(instanceId, agent?.id)
        console.log(`\n===== GitHub dry-run (no PR) — ${ghc ? ghc.repo + '@' + ghc.branch + ':' + ghc.contentPath : 'NO GITHUB CONFIG'} =====`)
        if (ghc) {
            const ops = ['meta', 'schema', 'links', 'slug', 'body_expand', 'image_alt', 'answer_first'] as const
            for (const op of ops) {
                try {
                    const res = await runSeoGithubBatch(instanceId, op, { agentId: agent?.id, dryRun: true })
                    console.log(`  ${op.padEnd(13)} scanned=${res.scanned} candidates=${res.candidates} changed=${res.changed.length} proposals=${res.proposals.length} failures=${res.failures.length}${res.error ? ' error=' + res.error : ''}`)
                    for (const c of res.changed.slice(0, 3)) console.log(`      ✓ ${c.path} — ${String(c.detail).slice(0, 80)}`)
                } catch (e) { console.log(`  ${op.padEnd(13)} THREW ${(e as Error).message}`) }
            }
        }
    }

    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })