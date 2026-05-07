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
import { searchVolume, keywordDifficulty, LOCATION_IL } from '@/services/research/dataforseo'
import type { ResearchDataV2 } from '@/services/research/types'
import type { SeoKeywordResearchDfsData } from '@/controllers/hosting/research/stages/prefetch/seo_keyword_research'

interface EnrichmentStats {
    matched: number
    missingInAllSources: number
    filledVolume: number
    filledCpc: number
    filledKd: number
    filledPosition: number
    sourceBreakdown: { ideas: number; rankedKeywords: number; gsc: number }
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
    interface RankedSnapshot { volume: number | null; cpc: number | null; kd: number | null; position: number | null }
    const rankedByKw = new Map<string, RankedSnapshot>()
    for (const r of dfsData.rankedKeywords) {
        const kw = r.keyword_data?.keyword
        if (!kw) continue
        const ki = r.keyword_data?.keyword_info
        const pos = r.ranked_serp_element?.serp_item?.rank_absolute
        rankedByKw.set(norm(kw), {
            volume: typeof ki?.search_volume === 'number' ? ki.search_volume : null,
            cpc: typeof ki?.cpc === 'number' ? ki.cpc : null,
            kd: typeof ki?.keyword_difficulty === 'number' ? ki.keyword_difficulty : null,
            position: typeof pos === 'number' ? pos : null,
        })
    }
    interface GscSnapshot { position: number; impressions: number; clicks: number }
    const gscByKw = new Map<string, GscSnapshot>()
    for (const q of dfsData.gsc.queries) {
        if (q.query) gscByKw.set(norm(q.query), { position: q.position, impressions: q.impressions, clicks: q.clicks })
    }

    const stats: EnrichmentStats = {
        matched: 0, missingInAllSources: 0,
        filledVolume: 0, filledCpc: 0, filledKd: 0, filledPosition: 0,
        sourceBreakdown: { ideas: 0, rankedKeywords: 0, gsc: 0 },
    }
    for (const r of records) {
        if (!r || typeof r !== 'object') continue
        const rec = r as Record<string, unknown>
        const kwRaw = typeof rec.keyword === 'string' ? rec.keyword : null
        if (!kwRaw) continue
        const key = norm(kwRaw)
        const idea = ideasByKw.get(key)
        const ranked = rankedByKw.get(key)
        const gsc = gscByKw.get(key)
        const calibratedKd = calibratedKdByKw.get(key)
        const anySource = idea || ranked || gsc || calibratedKd !== undefined
        if (!anySource) {
            stats.missingInAllSources++
            continue
        }
        stats.matched++
        if (idea) stats.sourceBreakdown.ideas++
        if (ranked) stats.sourceBreakdown.rankedKeywords++
        if (gsc) stats.sourceBreakdown.gsc++

        let vol: number | null = null
        if (idea?.keyword_info && typeof idea.keyword_info.search_volume === 'number') vol = idea.keyword_info.search_volume
        else if (ranked?.volume !== null && ranked?.volume !== undefined) vol = ranked.volume
        if (vol !== null) { rec.volume_monthly = vol; stats.filledVolume++ }

        let cpc: number | null = null
        if (idea?.keyword_info && typeof idea.keyword_info.cpc === 'number') cpc = idea.keyword_info.cpc
        else if (ranked?.cpc !== null && ranked?.cpc !== undefined) cpc = ranked.cpc
        if (cpc !== null) { rec.cpc_ils = Math.round(cpc * 100) / 100; stats.filledCpc++ }

        let kd: number | null = null
        if (typeof calibratedKd === 'number') kd = calibratedKd
        else if (typeof idea?.keyword_properties?.keyword_difficulty === 'number') kd = idea.keyword_properties.keyword_difficulty
        else if (typeof idea?.keyword_info?.keyword_difficulty === 'number') kd = idea.keyword_info.keyword_difficulty
        else if (ranked?.kd !== null && ranked?.kd !== undefined) kd = ranked.kd
        if (kd !== null) { rec.difficulty_0_100 = kd; stats.filledKd++ }

        let pos: number | null = null
        if (gsc) pos = Math.round(gsc.position * 10) / 10
        else if (ranked?.position !== null && ranked?.position !== undefined) pos = ranked.position
        if (pos !== null) { rec.current_position = pos; stats.filledPosition++ }
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
    const normFn = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')
    const dfsIdeasNormSet = new Set(dfsData.ideas.map(i => normFn(i.keyword || '')))
    const dfsKdNormSet = new Set(dfsData.difficulty.map(d => normFn(d.keyword || '')))
    let inIdeas = 0, inKd = 0
    for (const r of records) {
        const kw = String(r.keyword || '')
        const k = normFn(kw)
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

    // ─── Apply pass-1 enrichment ──
    const recordsCopy = JSON.parse(JSON.stringify(records)) as Array<Record<string, unknown>>
    const stats = enrichKeywordRecordsFromDfs(recordsCopy, dfsData)

    // ─── Pass-2: live DFS lookup for record keywords ──
    console.log(`Running pass-2 live DFS lookup (searchVolume + keywordDifficulty on the actual record keywords)...`)
    const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')
    const recordKeywords = Array.from(new Set(
        recordsCopy.map(r => typeof r.keyword === 'string' ? r.keyword.trim() : null)
            .filter((k): k is string => !!k)
    ))
    let liveCost = 0
    let liveFilledVol = 0, liveFilledKd = 0, liveFilledCpc = 0
    if (recordKeywords.length > 0) {
        try {
            const sv = await searchVolume(instanceId, recordKeywords, { location_code: LOCATION_IL, language_code: dfsData.languageCode })
            liveCost += sv.cost
            const svMap = new Map<string, { search_volume: number | null; cpc: number | null }>()
            for (const item of sv.items) {
                if (item.keyword) svMap.set(norm(item.keyword), {
                    search_volume: typeof item.search_volume === 'number' ? item.search_volume : null,
                    cpc: typeof item.cpc === 'number' ? item.cpc : null,
                })
            }
            const kdRes = await keywordDifficulty(instanceId, recordKeywords, { location_code: LOCATION_IL, language_code: dfsData.languageCode })
            liveCost += kdRes.cost
            const kdMap = new Map<string, number>()
            for (const item of kdRes.items) {
                if (item.keyword && typeof item.keyword_difficulty === 'number') kdMap.set(norm(item.keyword), item.keyword_difficulty)
            }
            for (const r of recordsCopy) {
                if (typeof r.keyword !== 'string') continue
                const k = norm(r.keyword)
                const svItem = svMap.get(k)
                if (svItem) {
                    if (r.volume_monthly == null && typeof svItem.search_volume === 'number') { r.volume_monthly = svItem.search_volume; liveFilledVol++ }
                    if (r.cpc_ils == null && typeof svItem.cpc === 'number') { r.cpc_ils = Math.round(svItem.cpc * 100) / 100; liveFilledCpc++ }
                }
                const kdVal = kdMap.get(k)
                if (r.difficulty_0_100 == null && typeof kdVal === 'number') { r.difficulty_0_100 = kdVal; liveFilledKd++ }
            }
            console.log(`  pass-2 cost: $${liveCost.toFixed(4)}, filled: vol=${liveFilledVol}, cpc=${liveFilledCpc}, kd=${liveFilledKd}`)
        } catch (err) {
            console.warn(`pass-2 failed:`, (err as Error).message)
        }
    }

    console.log(`Enrichment stats:`)
    console.log(`  matched (any source): ${stats.matched}/${records.length}`)
    console.log(`  missing in all:       ${stats.missingInAllSources}/${records.length}`)
    console.log(`  filled volume:        ${stats.filledVolume}`)
    console.log(`  filled CPC:           ${stats.filledCpc}`)
    console.log(`  filled KD:            ${stats.filledKd}`)
    console.log(`  filled position:      ${stats.filledPosition}`)
    console.log(`  source breakdown:     ideas=${stats.sourceBreakdown.ideas}  ranked=${stats.sourceBreakdown.rankedKeywords}  gsc=${stats.sourceBreakdown.gsc}\n`)

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