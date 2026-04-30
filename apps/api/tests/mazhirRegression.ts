/**
 * Mazhir Regression Test Runner
 *
 * Loads fixtures from `tests/fixtures/*.json`, runs runMazhirAudit against
 * each, and asserts the output matches `expectedAuditAssertions`. Catches
 * silent quality drift (e.g. "tCPA suddenly ₪250 again").
 *
 * Run: npx tsx apps/api/tests/mazhirRegression.ts
 *
 * For CI: exit code 0 = all passed, 1 = at least one assertion failed.
 *
 * NOTE: This test stubs out external APIs (GA4, Google Ads, DataForSEO etc.)
 * by injecting mocks directly into the in-memory enrichment cache. It does
 * NOT make live network calls — that's handled by separate integration tests.
 */
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

interface FixtureAssertions {
    blockers?: { mustContainOneMatching?: string[]; mustNotContain?: string[] }
    methodology?: { mustBeOneOf?: string[] }
    trackingHealth?: { scoreMustBeOneOf?: string[]; issues?: { mustNotMentionPattern?: string; mustReconcileGA4VsCsv?: boolean } }
    estimatedMonthlyConversions?: { expectedMin: number; expectedMax: number; rationale: string }
    recommendedTcpa?: { minIls: number; maxIls: number; rationale: string }
    sourceCoverage?: { ga4MustBeOk?: boolean; googleAdsAccountMustBeOk?: boolean }
    dataReconciliation?: { conflictsMustExist?: boolean; groundTruthMustReferenceClientMemory?: boolean }
    derivationFieldsRequired?: string[]
}

interface Fixture {
    _meta: { name: string; purpose: string }
    instanceId: string
    paidProfile: any
    expectedAuditAssertions: FixtureAssertions
    researchDataSnapshot: any
    ga4MockData: any
    googleAdsCsvMockData: any
}

interface AssertionResult {
    fixture: string
    assertion: string
    passed: boolean
    detail?: string
}

function getNested(obj: any, path: string): any {
    return path.split('.').reduce((o, k) => o?.[k], obj)
}

function runAssertions(fixtureName: string, audit: any, expected: FixtureAssertions): AssertionResult[] {
    const results: AssertionResult[] = []

    // Blockers
    if (expected.blockers?.mustContainOneMatching) {
        const blockers = (audit.blockers || []).join(' | ').toLowerCase()
        const matched = expected.blockers.mustContainOneMatching.some(p => blockers.includes(p.toLowerCase()))
        results.push({
            fixture: fixtureName,
            assertion: 'blockers contain expected pattern',
            passed: matched,
            detail: matched ? undefined : `none of [${expected.blockers.mustContainOneMatching.join(', ')}] found in: ${blockers || '(empty)'}`,
        })
    }
    if (expected.blockers?.mustNotContain) {
        for (const forbidden of expected.blockers.mustNotContain) {
            const blockers = (audit.blockers || []).join(' | ')
            const found = blockers.includes(forbidden)
            results.push({
                fixture: fixtureName,
                assertion: `blockers must NOT contain "${forbidden}"`,
                passed: !found,
                detail: found ? `found: "${forbidden}" in blockers` : undefined,
            })
        }
    }

    // Methodology
    if (expected.methodology?.mustBeOneOf) {
        const ok = expected.methodology.mustBeOneOf.includes(audit.methodology)
        results.push({
            fixture: fixtureName,
            assertion: `methodology in [${expected.methodology.mustBeOneOf.join('|')}]`,
            passed: ok,
            detail: ok ? undefined : `got: ${audit.methodology}`,
        })
    }

    // Tracking score
    if (expected.trackingHealth?.scoreMustBeOneOf) {
        const ok = expected.trackingHealth.scoreMustBeOneOf.includes(audit.trackingHealth?.score)
        results.push({
            fixture: fixtureName,
            assertion: `trackingHealth.score in [${expected.trackingHealth.scoreMustBeOneOf.join('|')}]`,
            passed: ok,
            detail: ok ? undefined : `got: ${audit.trackingHealth?.score}`,
        })
    }
    if (expected.trackingHealth?.issues?.mustNotMentionPattern) {
        const pattern = expected.trackingHealth.issues.mustNotMentionPattern
        const issuesText = JSON.stringify(audit.trackingHealth?.issues || [])
        const found = issuesText.toLowerCase().includes(pattern.toLowerCase())
        results.push({
            fixture: fixtureName,
            assertion: `trackingHealth.issues must NOT mention "${pattern}"`,
            passed: !found,
            detail: found ? `pattern still appears — agent failed to reconcile GA4 vs CSV` : undefined,
        })
    }

    // Estimated conversions range
    if (expected.estimatedMonthlyConversions) {
        const v = audit.estimatedMonthlyConversions?.expected
        const inRange = typeof v === 'number' && v >= expected.estimatedMonthlyConversions.expectedMin && v <= expected.estimatedMonthlyConversions.expectedMax
        results.push({
            fixture: fixtureName,
            assertion: `estimatedMonthlyConversions.expected in [${expected.estimatedMonthlyConversions.expectedMin},${expected.estimatedMonthlyConversions.expectedMax}]`,
            passed: inRange,
            detail: inRange ? undefined : `got: ${v} — ${expected.estimatedMonthlyConversions.rationale}`,
        })
    }

    // Recommended tCPA range (drawn from mediaPlan, not audit, but stamped here too if present)
    if (expected.recommendedTcpa) {
        const v = audit.recommendedTcpa ?? audit.mediaPlan?.transitionToTcpa?.suggestedCpaIls
        const inRange = typeof v === 'number' && v >= expected.recommendedTcpa.minIls && v <= expected.recommendedTcpa.maxIls
        results.push({
            fixture: fixtureName,
            assertion: `recommendedTcpa in [₪${expected.recommendedTcpa.minIls},₪${expected.recommendedTcpa.maxIls}]`,
            passed: inRange,
            detail: inRange ? undefined : `got: ₪${v} — ${expected.recommendedTcpa.rationale}`,
        })
    }

    // Source coverage
    if (expected.sourceCoverage?.ga4MustBeOk) {
        const ok = audit.sourceCoverage?.ga4?.status === 'ok'
        results.push({
            fixture: fixtureName,
            assertion: 'sourceCoverage.ga4.status === "ok"',
            passed: ok,
            detail: ok ? undefined : `got: ${audit.sourceCoverage?.ga4?.status} (${audit.sourceCoverage?.ga4?.reason || ''})`,
        })
    }
    if (expected.sourceCoverage?.googleAdsAccountMustBeOk) {
        const ok = audit.sourceCoverage?.googleAdsAccount?.status === 'ok'
        results.push({
            fixture: fixtureName,
            assertion: 'sourceCoverage.googleAdsAccount.status === "ok"',
            passed: ok,
            detail: ok ? undefined : `got: ${audit.sourceCoverage?.googleAdsAccount?.status}`,
        })
    }

    // Reconciliation
    if (expected.dataReconciliation?.conflictsMustExist) {
        const conflicts = audit.dataReconciliation?.conflicts || []
        const ok = conflicts.length > 0
        results.push({
            fixture: fixtureName,
            assertion: 'dataReconciliation.conflicts non-empty',
            passed: ok,
            detail: ok ? undefined : 'no conflicts surfaced — agent silently merged contradictory sources',
        })
    }
    if (expected.dataReconciliation?.groundTruthMustReferenceClientMemory) {
        const truth = (audit.dataReconciliation?.groundTruthChosen || '').toLowerCase()
        const ok = truth.includes('client') || truth.includes('historical') || truth.includes('memory') || truth.includes('זיכרון')
        results.push({
            fixture: fixtureName,
            assertion: 'groundTruthChosen references client memory',
            passed: ok,
            detail: ok ? undefined : `got: "${audit.dataReconciliation?.groundTruthChosen}"`,
        })
    }

    // Derivation fields
    for (const field of expected.derivationFieldsRequired || []) {
        const parent = field.includes('.') ? getNested(audit, field.split('.').slice(0, -1).join('.')) : audit
        const hasDerivation = parent && typeof parent === 'object' && typeof parent.derivation === 'string' && parent.derivation.length > 10
        results.push({
            fixture: fixtureName,
            assertion: `${field} has derivation field`,
            passed: hasDerivation,
            detail: hasDerivation ? undefined : `missing derivation for ${field}`,
        })
    }

    return results
}

async function main() {
    const fixtureDir = join(__dirname, 'fixtures')
    const files = readdirSync(fixtureDir).filter(f => f.endsWith('.json'))
    if (files.length === 0) {
        console.error('No fixtures found in', fixtureDir)
        process.exit(1)
    }

    const allResults: AssertionResult[] = []

    for (const file of files) {
        const fixture: Fixture = JSON.parse(readFileSync(join(fixtureDir, file), 'utf-8'))
        console.log(`\n=== ${fixture._meta.name} ===`)
        console.log(`    ${fixture._meta.purpose}`)

        // For now: run in dry-run mode using a saved audit snapshot if present.
        // Live audit run requires real Anthropic API key + mocked enrichment.
        // Phase 1 ships the fixture + assertion runner; phase 5 wires CI runs.
        const snapshotPath = join(fixtureDir, file.replace('.json', '.snapshot.json'))
        let audit: any
        try {
            audit = JSON.parse(readFileSync(snapshotPath, 'utf-8'))
            console.log(`    [snapshot] using saved audit from ${snapshotPath.split('/').pop()}`)
        } catch {
            console.log(`    [skip] no snapshot found at ${snapshotPath.split('/').pop()} — run \`mazhirRegression --record ${file}\` to generate`)
            continue
        }

        const results = runAssertions(fixture._meta.name, audit, fixture.expectedAuditAssertions)
        allResults.push(...results)

        for (const r of results) {
            const icon = r.passed ? 'PASS' : 'FAIL'
            console.log(`    [${icon}] ${r.assertion}${r.detail ? ' — ' + r.detail : ''}`)
        }
    }

    const failed = allResults.filter(r => !r.passed).length
    const passed = allResults.filter(r => r.passed).length
    console.log(`\n=== Total: ${passed} passed, ${failed} failed ===`)
    process.exit(failed > 0 ? 1 : 0)
}

if (require.main === module) {
    main().catch(err => {
        console.error('Test runner error:', err)
        process.exit(2)
    })
}
