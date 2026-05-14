/**
 * Phase 4.2.3 smoke test — verify budget scenario math is deterministic
 * and produces sensible Year-1 projections.
 */

import { classifyIlVertical, IL_VERTICAL_BENCHMARKS } from '@/services/paidResearch/ilVerticalBenchmarks'
import { generateBudgetScenarios, renderScenariosForPrompt } from '@/services/paidResearch/budgetScenarioGenerator'

async function main() {
    console.log('=== Phase 4.2.3 budget scenarios smoke test ===\n')

    // ── 1. Classification ──
    const v1 = classifyIlVertical({
        businessName: 'Storage For You',
        businessDesc: 'שירות אחסון פרטי באזור מרכז',
        productsText: '',
    })
    if (v1.vertical !== 'storage_self_storage') {
        console.error(`FAIL: expected storage_self_storage, got ${v1.vertical}`)
        process.exit(1)
    }
    console.log(`[classifier] storage business → ${v1.vertical} (confidence: ${v1.confidence})`)

    const v2 = classifyIlVertical({
        businessName: 'Legal Pro',
        businessDesc: 'עורך דין בנושאי גירושין ונזיקין',
        productsText: '',
    })
    if (v2.vertical !== 'legal_consult') {
        console.error(`FAIL: expected legal_consult, got ${v2.vertical}`)
        process.exit(1)
    }
    console.log(`[classifier] legal business → ${v2.vertical}`)

    const v3 = classifyIlVertical({ businessName: 'XYZ', businessDesc: 'unrelated text', productsText: '' })
    if (v3.vertical !== 'unknown') {
        console.error(`FAIL: expected unknown for unmatched, got ${v3.vertical}`)
        process.exit(1)
    }
    console.log(`[classifier] generic → ${v3.vertical}`)

    // ── 2. Scenario generation for storage ──
    const bundle = generateBudgetScenarios({
        vertical: 'storage_self_storage',
        keywordLandscape: null,
        userBudgetHintIls: null,
    })
    if (bundle.scenarios.length !== 3) {
        console.error(`FAIL: expected 3 scenarios, got ${bundle.scenarios.length}`)
        process.exit(1)
    }
    console.log(`[scenarios] generated ${bundle.scenarios.length} scenarios for ${bundle.vertical_label_he}`)

    for (const s of bundle.scenarios) {
        console.log(`  - ${s.label_he}: monthly ₪${s.monthly_budget_ils}, Y1 spend ₪${s.year_1_summary.total_spend_ils.toLocaleString()}, conv ${s.year_1_summary.total_conversions_est}, CPA ₪${s.year_1_summary.avg_cpa_ils}, ROAS ${s.year_1_summary.avg_roas}×`)
        // Verify allocations sum correctly
        const a = s.allocation
        const sum = a.search_brand_ils + a.search_nonbrand_ils + a.pmax_ils
            + a.display_ils + a.meta_prospecting_ils + a.meta_retargeting_ils
        if (Math.abs(sum - a.total_ils) > 5) {
            console.error(`FAIL: ${s.label_he} allocation sum ${sum} != total ${a.total_ils}`)
            process.exit(1)
        }
        // Verify monthly projection has 12 entries
        if (s.monthly_projection.length !== 12) {
            console.error(`FAIL: ${s.label_he} monthly_projection has ${s.monthly_projection.length} entries, expected 12`)
            process.exit(1)
        }
        // First 2 months marked learning
        if (!s.monthly_projection[0].learning_phase || !s.monthly_projection[1].learning_phase) {
            console.error(`FAIL: ${s.label_he} months 1-2 should be learning_phase`)
            process.exit(1)
        }
        // Months 3+ NOT learning
        if (s.monthly_projection[2].learning_phase) {
            console.error(`FAIL: ${s.label_he} month 3 should NOT be learning_phase`)
            process.exit(1)
        }
    }
    console.log('  ✓ all 3 scenarios pass allocation + projection structure checks')

    // ── 3. Budget hint override ──
    const hintBundle = generateBudgetScenarios({
        vertical: 'storage_self_storage',
        keywordLandscape: null,
        userBudgetHintIls: 5000,
    })
    if (hintBundle.scenarios[1].monthly_budget_ils !== 5000) {
        console.error(`FAIL: hint=5000 should set balanced budget to 5000, got ${hintBundle.scenarios[1].monthly_budget_ils}`)
        process.exit(1)
    }
    console.log(`[hint] userBudgetHintIls=5000 → balanced tier sized at ₪${hintBundle.scenarios[1].monthly_budget_ils}`)

    // ── 4. Unknown vertical → working_hypothesis confidence ──
    const unknownBundle = generateBudgetScenarios({
        vertical: 'unknown',
        keywordLandscape: null,
        userBudgetHintIls: null,
    })
    if (unknownBundle.scenarios[0].confidence !== 'working_hypothesis') {
        console.error(`FAIL: unknown vertical should produce working_hypothesis confidence`)
        process.exit(1)
    }
    console.log('[confidence] unknown vertical → working_hypothesis')

    // ── 5. Render prompt block ──
    const rendered = renderScenariosForPrompt(bundle)
    const required = [
        'שמרני', 'מאוזן', 'אגרסיבי',
        'Search Brand:', 'Pmax:', 'Meta Prospecting:',
        'Monthly progression', 'Bidding progression',
        'Prerequisites:', 'Risks specific',
    ]
    for (const s of required) {
        if (!rendered.includes(s)) {
            console.error(`FAIL: rendered block missing "${s}"`)
            console.error('Preview:', rendered.slice(0, 500))
            process.exit(1)
        }
    }
    console.log(`[render] block ${rendered.length} chars, all sections present`)

    // ── 6. Vertical coverage ──
    console.log(`[catalog] ${Object.keys(IL_VERTICAL_BENCHMARKS).length} verticals defined`)

    console.log('\n=== ALL ASSERTIONS PASS ✓ ===')
    console.log('Phase 4.2.3 budget scenarios ready for integration.')
}

main().catch(err => { console.error(err); process.exit(1) })