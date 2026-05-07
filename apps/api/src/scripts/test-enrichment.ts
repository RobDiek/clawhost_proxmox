/**
 * Phase QA round-5 self-test — DFS enrichment on real records.
 *
 * Loads instance 44f484a852's existing seo_keyword_research records (where
 * almost all volume/KD are null), re-runs prefetch (DFS cache → $0), and
 * applies enrichKeywordRecordsFromDfs standalone. Reports before/after
 * fill ratios so we can verify the fix works WITHOUT spending Anthropic
 * credits on a full stage rerun.
 *
 * Usage on prod:
 *   cd /opt/openclaw-hosting/apps/api
 *   pnpm tsx src/scripts/test-enrichment.ts 44f484a852
 */

import { db } from '@/db'
import { instances } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { prefetchSeoKeywordResearch } from '@/controllers/hosting/research/stages/prefetch/seo_keyword_research'
import type { ResearchDataV2 } from '@/services/research/types'
import type { SeoKeywordResearchDfsData } from '@/controllers/hosting/research/stages/prefetch/seo_keyword_research'

interface EnrichmentStats {
    matched: number
    missingInDfs: number
    filledVolume: number
    filledCpc: number
    filledKd: number
}

function enrichKeywordRecordsFromDfs(
    records: unknown[],
    dfsData: SeoKeywordResearchDfsData,
): EnrichmentStats {
    const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')
    const ideasByKw = new Map<string, SeoKeywordResearchDfsData['ideas'][number]>()
    for (const i of dfsData.ideas) {
        if (i.keyword) ideasByKw.set(norm(i.keyword), i)
    }
    const calibratedKdByKw = new Map<string, number>()
    for (const d of dfsData.difficulty) {
        if (d.keyword && typeof d.keyword_difficulty === 'number') {
            calibratedKdByKw.set(norm(d.keyword), d.keyword_difficulty)
        }
    }
    const stats: EnrichmentStats = { matched: 0, missingInDfs: 0, filledVolume: 0, filledCpc: 0, filledKd: 0 }
    for (const r of records) {
        if (!r || typeof r !== 'object') continue
        const rec = r as Record<string, unknown>
        const kwRaw = typeof rec.keyword === 'string' ? rec.keyword : null
        if (!kwRaw) continue
        const key = norm(kwRaw)
        const idea = ideasByKw.get(key)
        const calibratedKd = calibratedKdByKw.get(key)

        if (!idea && calibratedKd === undefined) {
            stats.missingInDfs++
            continue
        }
        stats.matched++

        if (idea?.keyword_info) {
            if (typeof idea.keyword_info.search_volume === 'number') {
                rec.volume_monthly = idea.keyword_info.search_volume
                stats.filledVolume++
            }
            if (typeof idea.keyword_info.cpc === 'number') {
                rec.cpc_ils = Math.round(idea.keyword_info.cpc * 100) / 100
                stats.filledCpc++
            }
        }
        const kd = typeof calibratedKd === 'number'
            ? calibratedKd
            : (idea?.keyword_properties?.keyword_difficulty
                ?? idea?.keyword_info?.keyword_difficulty)
        if (typeof kd === 'number') {
            rec.difficulty_0_100 = kd
            stats.filledKd++
        }
    }
    return stats
}

async function main(): Promise<void> {
    const instanceId = process.argv[2] || '44f484a852'

    console.log(`\n=== Phase QA round-5 self-test ===`)
    console.log(`Instance: ${instanceId}`)
    console.log(`Goal: prove DFS enrichment fills volume/CPC/KD that the model left null.\n`)

    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) {
        console.error(`No instance found with id=${instanceId}`)
        process.exit(1)
    }

    const rd = (inst.researchData as ResearchDataV2 | null) || {}
    const stage3 = rd.results?.seo_keyword_research
    if (!stage3?.records) {
        console.error(`Instance has no seo_keyword_research.records — run stage 3 first.`)
        process.exit(1)
    }

    const records = stage3.records as Array<Record<string, unknown>>
    console.log(`Loaded ${records.length} existing records.\n`)

    // ─── Snapshot BEFORE ──
    const before = {
        volNull: records.filter(r => r.volume_monthly == null).length,
        kdNull: records.filter(r => r.difficulty_0_100 == null).length,
        cpcNull: records.filter(r => r.cpc_ils == null).length,
    }
    console.log(`BEFORE enrichment:`)
    console.log(`  volume_monthly null:    ${before.volNull}/${records.length}`)
    console.log(`  difficulty_0_100 null:  ${before.kdNull}/${records.length}`)
    console.log(`  cpc_ils null:           ${before.cpcNull}/${records.length}\n`)

    // ─── Re-fetch DFS data (cached) ──
    console.log(`Running DFS prefetch (cached → expected $0)...`)
    const dfsData = await prefetchSeoKeywordResearch(instanceId, rd)
    console.log(`  cost=$${dfsData.totalCostUsd.toFixed(4)}, cache=${dfsData.cacheHits}/${dfsData.cacheHits + dfsData.cacheMisses}, ideas=${dfsData.ideas.length}, difficulty=${dfsData.difficulty.length}\n`)

    // ─── DEBUG: cross-reference each record keyword against DFS ──
    console.log(`\nDEBUG — record keyword × DFS membership:`)
    const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')
    const dfsIdeasNormSet = new Set(dfsData.ideas.map(i => norm(i.keyword || '')))
    const dfsKdNormSet = new Set(dfsData.difficulty.map(d => norm(d.keyword || '')))
    let inIdeas = 0, inKd = 0
    for (const r of records) {
        const kw = String(r.keyword || '')
        const k = norm(kw)
        const idea = dfsIdeasNormSet.has(k)
        const kd = dfsKdNormSet.has(k)
        if (idea) inIdeas++
        if (kd) inKd++
        console.log(`  ${idea ? 'IDEA' : '----'} ${kd ? 'KD ' : '---'} | "${kw}"`)
    }
    console.log(`  → ${inIdeas}/${records.length} in ideas, ${inKd}/${records.length} in difficulty`)
    console.log(`\nDEBUG — first 30 DFS ideas (sorted by volume):`)
    const top30 = [...dfsData.ideas].filter(i => i.keyword_info?.search_volume).sort((a, b) => (b.keyword_info!.search_volume || 0) - (a.keyword_info!.search_volume || 0)).slice(0, 30)
    for (const i of top30) {
        console.log(`  v=${i.keyword_info?.search_volume} kd=${i.keyword_info?.keyword_difficulty ?? i.keyword_properties?.keyword_difficulty ?? '-'} | ${i.keyword}`)
    }
    console.log()

    // ─── Apply enrichment ──
    const recordsCopy = JSON.parse(JSON.stringify(records)) as Array<Record<string, unknown>>
    const stats = enrichKeywordRecordsFromDfs(recordsCopy, dfsData)
    console.log(`Enrichment stats:`)
    console.log(`  matched in DFS:    ${stats.matched}/${records.length}`)
    console.log(`  not in DFS:        ${stats.missingInDfs}/${records.length}`)
    console.log(`  filled volume:     ${stats.filledVolume}`)
    console.log(`  filled CPC:        ${stats.filledCpc}`)
    console.log(`  filled KD:         ${stats.filledKd}\n`)

    // ─── Snapshot AFTER ──
    const after = {
        volNull: recordsCopy.filter(r => r.volume_monthly == null).length,
        kdNull: recordsCopy.filter(r => r.difficulty_0_100 == null).length,
        cpcNull: recordsCopy.filter(r => r.cpc_ils == null).length,
    }
    console.log(`AFTER enrichment:`)
    console.log(`  volume_monthly null:    ${after.volNull}/${records.length}  (was ${before.volNull})`)
    console.log(`  difficulty_0_100 null:  ${after.kdNull}/${records.length}  (was ${before.kdNull})`)
    console.log(`  cpc_ils null:           ${after.cpcNull}/${records.length}  (was ${before.cpcNull})\n`)

    // ─── Sample diffs ──
    console.log(`Sample enriched records (top 5):`)
    let shown = 0
    for (let i = 0; i < records.length && shown < 5; i++) {
        const orig = records[i]
        const enr = recordsCopy[i]
        const changed = orig.volume_monthly !== enr.volume_monthly
            || orig.difficulty_0_100 !== enr.difficulty_0_100
            || orig.cpc_ils !== enr.cpc_ils
        if (!changed) continue
        console.log(`  [${i}] "${orig.keyword}":`)
        console.log(`      volume:     ${String(orig.volume_monthly)} → ${String(enr.volume_monthly)}`)
        console.log(`      difficulty: ${String(orig.difficulty_0_100)} → ${String(enr.difficulty_0_100)}`)
        console.log(`      cpc:        ${String(orig.cpc_ils)} → ${String(enr.cpc_ils)}`)
        shown++
    }
    if (shown === 0) console.log(`  (no records changed)`)

    // ─── Verdict ──
    const improved = (before.volNull - after.volNull) + (before.kdNull - after.kdNull) + (before.cpcNull - after.cpcNull)
    console.log(`\n=== VERDICT ===`)
    if (improved > 0) {
        console.log(`PASS — enriched ${improved} previously-null fields across ${records.length} records.`)
    } else {
        console.log(`FAIL — no fields enriched. Either DFS data missing or normalization mismatched.`)
    }

    process.exit(0)
}

main().catch((err) => {
    console.error('Test failed:', err)
    process.exit(1)
})