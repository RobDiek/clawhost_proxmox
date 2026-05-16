/**
 * Prefetch for paid_budget_scenarios stage.
 *
 * Reads:
 *   - rd.results.paid_keyword_research → blended CPC + keyword count
 *   - rd.results.paid_competitor_landscape → competitor activity hints
 *   - rd.answers (businessName / businessDescription / products / paidBudget hint)
 *   - rd.results.audience_personas (optional — vertical inference if no
 *     clear match in business description)
 *
 * Outputs: BudgetScenariosBundle ready for Opus prompt synthesis.
 */

import type { ResearchDataV2 } from '@/services/research/types'
import { classifyIlVertical } from '@/services/paidResearch/ilVerticalBenchmarks'
import { generateBudgetScenarios, type BudgetScenariosBundle } from '@/services/paidResearch/budgetScenarioGenerator'
import type { PaidKeywordLandscape } from '@/services/paidResearch/keywordPaidLandscape'

interface ProductSku {
    name?: string
    description?: string
    priceIls?: number | null
}

export async function prefetchPaidBudgetScenarios(
    _instanceId: string,
    rd: ResearchDataV2,
): Promise<BudgetScenariosBundle> {
    const answers = (rd.answers as Record<string, unknown>) || {}
    const businessName = typeof answers.businessName === 'string' ? answers.businessName : ''
    const businessDesc = typeof answers.businessDescription === 'string'
        ? answers.businessDescription
        : (typeof answers.businessDesc === 'string' ? answers.businessDesc : '')
    const products = Array.isArray(answers.products) ? (answers.products as ProductSku[]) : []
    const productsText = products
        .map(p => `${p?.name || ''} ${p?.description || ''}`)
        .join(' ')

    // Classify vertical
    const verticalResult = classifyIlVertical({ businessName, businessDesc, productsText })

    // Pull keyword landscape from upstream (paid_keyword_research stage output)
    const paidKwResult = rd.results?.paid_keyword_research
    const keywordLandscape: PaidKeywordLandscape | null = paidKwResult
        ? ((paidKwResult.dfsData as PaidKeywordLandscape) || null)
        : null

    // Phase 4.2.1-I — REAL account anchors from baseline (preflight stage).
    // Replaces industry-only benchmarks. When baseline.accountMetrics is
    // available, scenarios anchor on the user's actual CPC / CR / CPA.
    interface BaselineShape {
        dfsData?: {
            googleAds?: {
                accountMetrics?: {
                    available?: boolean
                    avgCpcIls?: number
                    conversionRatePct?: number
                    cpaIls?: number
                    cost?: number
                    conversions?: number
                }
            }
        }
    }
    const baseline = rd.results?.client_account_baseline as BaselineShape | undefined
    const am = baseline?.dfsData?.googleAds?.accountMetrics
    const accountAnchor = am?.available
        ? {
            avgCpcIls: am.avgCpcIls,
            conversionRatePct: am.conversionRatePct,
            cpaIls: am.cpaIls,
            totalCost90d: am.cost,
            conversions90d: am.conversions,
        }
        : undefined

    // User budget hint — answers.paidBudget OR paidProfile.monthlyBudgetIls if provided
    const budgetHintRaw = answers.paidBudget
        ?? (rd.paidProfile as Record<string, unknown> | undefined)?.monthlyBudgetIls
    const budgetHint = typeof budgetHintRaw === 'number' && budgetHintRaw > 0
        ? budgetHintRaw
        : (typeof budgetHintRaw === 'string' && /^\d+$/.test(budgetHintRaw) ? parseInt(budgetHintRaw, 10) : null)

    return generateBudgetScenarios({
        vertical: verticalResult.vertical,
        keywordLandscape,
        userBudgetHintIls: budgetHint,
        accountAnchor,
    })
}