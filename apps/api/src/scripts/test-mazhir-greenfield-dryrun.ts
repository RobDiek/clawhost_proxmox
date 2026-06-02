/**
 * Greenfield Google Ads dry-run smoke test.
 *
 * Proves the systemic mazhirExecutor fixes WITHOUT touching the live Ads account:
 *   - injects a synthetic build_new MediaPlan into the primary agent's
 *     research_data (the canonical store the executor now reads),
 *   - runs executeMediaPlan({ dryRun: true }) — dryRun short-circuits BEFORE any
 *     createCampaign call, so ZERO Google Ads mutations (only read-only geo
 *     lookups),
 *   - restores research_data in `finally` (removes the synthetic plan) so the
 *     tenant's data is left exactly as before.
 *
 *   npx tsx src/scripts/test-mazhir-greenfield-dryrun.ts <instanceId>
 */
import { resolvePrimaryAgent, readResearchData, writeResearchData } from '@/services/agentContext'
import { executeMediaPlan } from '@/services/mazhirExecutor'

async function main() {
    const instanceId = process.argv[2] || '44f484a852'
    const agent = await resolvePrimaryAgent(instanceId)
    const rd: any = (await readResearchData(agent, instanceId)) || {}
    const hadPlan = !!rd.mediaPlan
    const originalPlan = rd.mediaPlan

    const syntheticPlan = {
        generatedAt: '2026-01-01T00:00:00.000Z',
        status: 'pending_review',
        planMode: 'build_new',
        methodology: { framework: 'greenfield-dryrun', rationale: 'synthetic test plan' },
        negativeKeywordLibrary: { industry: ['חינם', 'יד שנייה'], brandDefense: [], junkPatterns: ['משרות', 'איך עושים'] },
        campaigns: [
            {
                name: '[DRYRUN] רשת חיפוש — קרטונים למעבר דירה', type: 'SEARCH', intent: 'bottom_funnel',
                dailyBudgetIls: 80, bidStrategy: 'MAXIMIZE_CLICKS',
                geo: { mode: 'national' }, language: 'he',
                adGroups: [{
                    name: 'קרטונים',
                    keywords: [{ text: 'קרטונים למעבר דירה', matchType: 'PHRASE' }, { text: 'קניית קרטונים', matchType: 'BROAD' }],
                    headlines: ['קרטונים למעבר דירה', 'משלוח מהיר עד הבית', 'מחירים משתלמים', 'איכות מעולה'],
                    descriptions: ['קרטונים חזקים בכל הגדלים, משלוח מהיר.', 'הזמינו אונליין וקבלו עד הבית.'],
                    finalUrl: 'https://packing-station.co.il/shop/',
                }],
                rationale: 'synthetic', status: 'pending_review',
            },
            {
                name: '[DRYRUN] Performance Max — אריזה', type: 'PERFORMANCE_MAX', intent: 'mid_funnel',
                dailyBudgetIls: 60, bidStrategy: 'MAXIMIZE_CONVERSIONS',
                geo: { mode: 'national' }, language: 'he',
                adGroups: [{ name: 'pmax', keywords: [], headlines: ['פתרונות אריזה', 'הכל למעבר דירה'], descriptions: ['ציוד אריזה מקצועי במקום אחד.'], finalUrl: 'https://packing-station.co.il/' }],
                rationale: 'synthetic', status: 'pending_review',
            },
        ],
    }

    console.log(`\n=== greenfield dry-run for ${instanceId} (agent ${agent?.id}) — hadExistingPlan=${hadPlan} ===`)
    try {
        await writeResearchData(agent, instanceId, { ...rd, mediaPlan: syntheticPlan })
        const res = await executeMediaPlan(instanceId, { dryRun: true })
        console.log('overallStatus:', res.overallStatus)
        console.log('preflight:', JSON.stringify(res.preflight))
        console.log('perCampaign:')
        for (const c of res.perCampaign) console.log(`  - ${c.name} → ${c.status}${c.error ? ' err=' + c.error : ''}`)
    } finally {
        // ALWAYS restore — remove the synthetic plan (or put the original back).
        const cur: any = (await readResearchData(agent, instanceId)) || {}
        if (hadPlan) cur.mediaPlan = originalPlan
        else delete cur.mediaPlan
        await writeResearchData(agent, instanceId, cur)
        const check: any = (await readResearchData(agent, instanceId)) || {}
        console.log(`\n[revert] mediaPlan restored — present now: ${!!check.mediaPlan} (was ${hadPlan})`)
    }
    process.exit(0)
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })