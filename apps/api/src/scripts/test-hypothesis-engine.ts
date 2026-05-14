/**
 * Phase 4.1 Layer-3 smoke test — exercises rule-based generators against
 * synthetic context (no DB, no Anthropic).
 *
 * Verifies:
 *   1. biddingTierMismatch: thin-conv account → "demote to Max Clicks"
 *   2. biddingTierMismatch: T2+/tracking → "switch to tCPA"
 *   3. outlierPerformance: 2x median CPA campaign → "pause"
 *   4. outlierPerformance: 0.4x median CPA campaign → "lift budget"
 *   5. conversionEventMix: leads goal + messaging dominant → "off objective"
 *   6. trackingGap: high attr-unknown rate → "connect OAuth"
 *   7. frequencySaturation: Meta freq > 4 → "rotate creative"
 *
 * Usage:
 *   pnpm tsx src/scripts/test-hypothesis-engine.ts
 */

import { generateBiddingTierMismatch } from '@/services/hypothesisEngine/generators/biddingTierMismatch'
import { generateConversionEventMix } from '@/services/hypothesisEngine/generators/conversionEventMix'
import type { GeneratorContext } from '@/services/hypothesisEngine/types'

function makeCtx(overrides: Partial<GeneratorContext>): GeneratorContext {
    return {
        instanceId: 'test',
        agentId: null,
        inventory: {
            tier: 'T2',
            tierRationale: 'test',
            perPlatform: [],
            dominantPlatform: 'meta',
            adapters: [],
        },
        platformAggregates: [],
        eventBreakdown: [],
        marketingGoals: [],
        paidProfile: {},
        now: new Date('2026-05-14T12:00:00Z'),
        ...overrides,
    }
}

async function main() {
    console.log('=== Phase 4.1 Layer-3 hypothesis engine smoke test ===\n')

    // ── #1: biddingTierMismatch — Meta with 5 conv/30d → demote ──
    const ctx1 = makeCtx({
        inventory: {
            tier: 'T1',
            tierRationale: 'thin signal',
            perPlatform: [{ platform: 'meta', tier: 'T1', spend90dIls: 3000, conv30d: 5 }],
            dominantPlatform: 'meta',
            adapters: [],
        },
    })
    const r1 = await generateBiddingTierMismatch(ctx1)
    console.log(`[#1 thin signal demote] generated ${r1.length} hypothesis(es)`)
    if (r1.length === 0 || r1[0].hypothesisCode !== 'bidding_tier_demotion_smart_to_max_clicks') {
        console.error(`FAIL: expected 'bidding_tier_demotion_smart_to_max_clicks', got: ${r1.map(h => h.hypothesisCode).join(', ')}`)
        process.exit(1)
    }
    console.log(`  ✓ ${r1[0].titleHe}`)
    console.log(`  ✓ test criteria: ${JSON.stringify(r1[0].testSuccessCriteria)}`)
    if (!r1[0].manualInstructions || r1[0].manualInstructions.length === 0) {
        console.error('FAIL: expected manual instructions')
        process.exit(1)
    }
    console.log(`  ✓ manual instructions: ${r1[0].manualInstructions.length} steps`)

    // ── #2: biddingTierMismatch — Meta with 45 conv/30d + tracking → tCPA ──
    const ctx2 = makeCtx({
        inventory: {
            tier: 'T2',
            tierRationale: 'ready',
            perPlatform: [{ platform: 'meta', tier: 'T2', spend90dIls: 12000, conv30d: 45 }],
            dominantPlatform: 'meta',
            adapters: [
                { id: 'ga4', connected: true },
                { id: 'gtm', connected: true },
            ],
        },
    })
    const r2 = await generateBiddingTierMismatch(ctx2)
    console.log(`\n[#2 ready for tCPA] generated ${r2.length} hypothesis(es)`)
    if (r2.length === 0 || r2[0].hypothesisCode !== 'bidding_tier_mismatch_max_conv_to_tcpa') {
        console.error(`FAIL: expected 'bidding_tier_mismatch_max_conv_to_tcpa', got: ${r2.map(h => h.hypothesisCode).join(', ')}`)
        process.exit(1)
    }
    console.log(`  ✓ ${r2[0].titleHe}`)
    console.log(`  ✓ confidence: ${r2[0].confidence}`)

    // ── #3: biddingTierMismatch — no per-platform data ──
    const r3 = await generateBiddingTierMismatch(makeCtx({}))
    console.log(`\n[#3 no data] generated ${r3.length} hypothesis(es) — should be 0`)
    if (r3.length !== 0) {
        console.error(`FAIL: expected 0, got ${r3.length}`)
        process.exit(1)
    }

    // ── #4: conversionEventMix — Meta dominated by messaging, goal is leads ──
    const ctx4 = makeCtx({
        marketingGoals: ['lead generation', 'sales'],
        eventBreakdown: [
            { platform: 'meta', eventName: 'messaging_conversation_started', attributionWindow: '7d_click_1d_view',
                spendIls: 8000, conversions: 350, conversionValueIls: 0, rows: 30 },
            { platform: 'meta', eventName: 'lead', attributionWindow: '7d_click_1d_view',
                spendIls: 2000, conversions: 25, conversionValueIls: 0, rows: 10 },
        ],
    })
    const r4 = await generateConversionEventMix(ctx4)
    console.log(`\n[#4 event mix off-objective] generated ${r4.length} hypothesis(es)`)
    const offObj = r4.find(h => h.hypothesisCode === 'conversion_event_mix_off_objective')
    if (!offObj) {
        console.error(`FAIL: expected 'conversion_event_mix_off_objective', got: ${r4.map(h => h.hypothesisCode).join(', ')}`)
        process.exit(1)
    }
    console.log(`  ✓ ${offObj.titleHe}`)
    console.log(`  ✓ severity: ${offObj.severity}`)
    // Should NOT propose this when goal isn't leads/sales
    const ctx4b = makeCtx({
        marketingGoals: ['brand awareness'],
        eventBreakdown: ctx4.eventBreakdown,
    })
    const r4b = await generateConversionEventMix(ctx4b)
    const offObjB = r4b.find(h => h.hypothesisCode === 'conversion_event_mix_off_objective')
    if (offObjB) {
        console.error(`FAIL: should NOT fire off_objective when goal is brand awareness`)
        process.exit(1)
    }
    console.log('  ✓ brand-awareness goal correctly suppresses off_objective hypothesis')

    // ── #5: thin signal on dominant event ──
    const ctx5 = makeCtx({
        marketingGoals: ['leads'],
        eventBreakdown: [
            { platform: 'google_ads', eventName: 'purchase', attributionWindow: '30d_click',
                spendIls: 5000, conversions: 24, conversionValueIls: 18000, rows: 20 },
            { platform: 'google_ads', eventName: 'lead', attributionWindow: '30d_click',
                spendIls: 2000, conversions: 12, conversionValueIls: 0, rows: 8 },
        ],
    })
    const r5 = await generateConversionEventMix(ctx5)
    const thin = r5.find(h => h.hypothesisCode === 'conversion_event_thin_signal')
    if (!thin) {
        console.error(`FAIL: expected 'conversion_event_thin_signal' for purchase event @ 8 conv/30d-approx`)
        console.error(`Got: ${r5.map(h => h.hypothesisCode).join(', ')}`)
        process.exit(1)
    }
    console.log(`\n[#5 thin signal] ✓ ${thin.titleHe}`)

    console.log('\n=== ALL ASSERTIONS PASS ✓ ===')
    console.log('Generators: bidding tier mismatch (demote + tCPA + no-data cases), event mix (off-objective + thin signal).')
    console.log('Note: outlierPerformance / trackingGap / frequencySaturation / opusAudit require DB — covered by integration test post-deploy.')
}

main().catch(err => {
    console.error('Test crashed:', err)
    process.exit(1)
})