/**
 * Phase 4.1 Layer-1 smoke test — runs the dataIngestion pipeline against a
 * synthetic Meta Ads CSV (matching the shape of Storage Station's actual
 * upload: campaign "חודש מתנה | ווצאפ | 26.2", 13803 impressions, 266 clicks,
 * 999.89 ILS) WITHOUT touching the DB or Anthropic.
 *
 * Tests:
 *   1. CSV parsing (UTF-8, BOM, Hebrew headers, IL date format)
 *   2. Source classifier fallback (no Anthropic → unknown, but mapper.canHandle still routes correctly)
 *   3. Meta Ads mapper (Hebrew column detection)
 *   4. Currency handling (ILS, no FX conversion needed)
 *   5. Validator (clean row passes; impossible rows reject)
 *   6. Quality scorer (well-populated row should get >0.6)
 *
 * Usage:
 *   cd apps/api && pnpm tsx src/scripts/test-data-ingestion.ts
 */

import { parseCsv } from '@/services/dataIngestion/csvParser'
import { metaAdsCsvMapper } from '@/services/dataIngestion/mappers/meta_ads_csv'
import { processRows } from '@/services/dataIngestion/normalize'
import type { ClassifierOutput } from '@/services/dataIngestion/classifier'

// Synthetic Meta Ads export — Hebrew UI variant, the same columns Storage
// Station's actual upload had. One real campaign + one validator-trap row
// (clicks > impressions, must reject).
const SYNTHETIC_META_CSV = `שם הקמפיין,תקופת הדיווח: התחלה,תקופת הדיווח: סיום,צפיות,קליקים על הקישור,סכום שהוצא (ILS),תוצאות,אינדיקטור התוצאה,תדירות,הגעה
"חודש מתנה | ווצאפ | 26.2",2026-02-26,2026-04-30,13803,266,999.89,189,messaging_conversation_started,2.4,5751
"קמפיין נוסף לבדיקה",2026-03-01,2026-03-31,5000,140,250.50,12,leads,1.8,2778
"שורת בעיה (clicks>impressions)",2026-03-01,2026-03-15,100,500,50.00,0,leads,1,100
סה"כ:,,,18903,906,1300.39,201,,,
`

async function main() {
    console.log('=== Phase 4.1 Layer-1 ingestion smoke test ===\n')

    // ── 1. CSV parser ──
    const buf = Buffer.from(SYNTHETIC_META_CSV, 'utf-8')
    const parsed = parseCsv(buf)
    console.log(`[parse] delimiter=${JSON.stringify(parsed.delimiter)}, headers=${parsed.headers.length}, rows=${parsed.rows.length}`)
    console.log(`[parse] headers: ${parsed.headers.join(' | ')}`)
    if (parsed.rows.length !== 4) {
        console.error(`FAIL: expected 4 rows (incl. Total), got ${parsed.rows.length}`)
        process.exit(1)
    }

    // ── 2. Mapper canHandle? ──
    const canHandle = metaAdsCsvMapper.canHandle('unknown', parsed.headers)
    console.log(`[mapper] meta_ads_csv.canHandle(unknown, headers) = ${canHandle}`)
    if (!canHandle) {
        console.error('FAIL: Meta mapper should have recognised Hebrew headers')
        process.exit(1)
    }

    // ── 3. Build a fake classifier output to drive the mapper ──
    const classifier: ClassifierOutput = {
        detectedSource: 'meta_ads_csv',
        confidence: 0.95,
        evidence: ['hebrew-meta-headers-detected'],
        rowsCount: parsed.rows.length,
        currency: 'ILS',
        warnings: [],
    }

    // ── 4. Map → MappedRow[] ──
    const mapped = metaAdsCsvMapper.map(parsed.rows, {
        sourceType: 'meta_ads_csv',
        classifier,
        filename: 'storage-station-meta-test.csv',
    })
    console.log(`[mapper] produced ${mapped.length} mapped rows`)
    for (const m of mapped) {
        console.log(`  - ${m.entityName} | imp=${m.impressions} clk=${m.clicks} spend=${m.spend} ${m.sourceCurrency} conv=${m.conversions} period=${m.periodStart}..${m.periodEnd}`)
    }
    if (mapped.length !== 3) {
        console.error(`FAIL: expected 3 mapped rows (totals skipped), got ${mapped.length}`)
        process.exit(1)
    }

    // ── 5. Process (validate + normalize) ──
    const { rows: normalized, rejected } = await processRows(mapped)
    console.log(`[normalize] normalized=${normalized.length}, rejected=${rejected.length}`)
    for (const n of normalized) {
        console.log(`  ✓ ${n.entityName} | spendIls=${n.spendIls?.toFixed(2)} fx=${n.fxRate} quality=${n.qualityScore} flags=[${n.flags.join(',')}]`)
    }
    for (const r of rejected) {
        console.log(`  ✗ ${r.row.entityName} → ${r.reason}`)
    }

    if (rejected.length !== 1 || rejected[0].reason !== 'clicks_exceed_impressions') {
        console.error(`FAIL: expected exactly 1 rejection (clicks_exceed_impressions), got: ${rejected.map(r => r.reason).join(', ')}`)
        process.exit(1)
    }
    if (normalized.length !== 2) {
        console.error(`FAIL: expected 2 normalized rows, got ${normalized.length}`)
        process.exit(1)
    }

    // ── 6. Storage Station row sanity ──
    const main = normalized.find(r => r.entityName?.includes('חודש מתנה'))
    if (!main) {
        console.error('FAIL: Storage Station\'s "חודש מתנה" row not found in normalized output')
        process.exit(1)
    }
    if (main.impressions !== 13803) {
        console.error(`FAIL: impressions expected 13803, got ${main.impressions}`)
        process.exit(1)
    }
    if (main.clicks !== 266) {
        console.error(`FAIL: clicks expected 266, got ${main.clicks}`)
        process.exit(1)
    }
    if (Math.abs((main.spendIls || 0) - 999.89) > 0.01) {
        console.error(`FAIL: spendIls expected 999.89, got ${main.spendIls}`)
        process.exit(1)
    }
    if (main.qualityScore < 0.6) {
        console.error(`FAIL: well-populated row should have qualityScore ≥0.6, got ${main.qualityScore}`)
        process.exit(1)
    }

    // ── 7. Attribution-aware fields (Phase 4.1 hardening) ──
    if (main.attributionWindow !== '7d_click_1d_view') {
        console.error(`FAIL: Meta default attribution window expected '7d_click_1d_view', got '${main.attributionWindow}'`)
        process.exit(1)
    }
    if (main.attributionModel !== 'last_click') {
        console.error(`FAIL: Meta default attribution model expected 'last_click', got '${main.attributionModel}'`)
        process.exit(1)
    }
    if (main.conversionEventName !== 'messaging_conversation_started') {
        console.error(`FAIL: Meta result_indicator 'messaging_conversation_started' expected to normalize to same; got '${main.conversionEventName}'`)
        process.exit(1)
    }
    if (main.accountTz !== 'Asia/Jerusalem') {
        console.error(`FAIL: account_tz expected 'Asia/Jerusalem', got '${main.accountTz}'`)
        process.exit(1)
    }
    // periodDateLocal: this row is a 64-day rollup (2026-02-26..2026-04-30),
    // so periodDateLocal SHOULD be undefined (multi-day custom grain).
    if (main.periodDateLocal !== undefined) {
        console.error(`FAIL: multi-day rollup should have periodDateLocal=undefined, got '${main.periodDateLocal}'`)
        process.exit(1)
    }
    console.log(`[attribution] ✓ window=${main.attributionWindow} model=${main.attributionModel} event=${main.conversionEventName} tz=${main.accountTz} dateLocal=${main.periodDateLocal ?? '<null=multi-day>'}`)

    // ── 8. Fingerprint uniqueness across event names ──
    // Same campaign + period but different conversion_event_name should
    // produce different fingerprints. Critical: a campaign exported with
    // 'messaging_conversation_started' AND 'lead' results must keep BOTH rows.
    const altRows: typeof mapped = mapped.map(m => ({
        ...m,
        conversionEventName: 'lead',   // change event name
    }))
    const { rows: altNormalized } = await processRows(altRows)
    const mainFp = main.fingerprint
    const altSame = altNormalized.find(r => r.entityName === main.entityName)
    if (!altSame) {
        console.error('FAIL: alt-event-name version of main row missing')
        process.exit(1)
    }
    if (altSame.fingerprint === mainFp) {
        console.error('FAIL: fingerprint should differ when conversion_event_name differs (else cross-event UPSERT collapses)')
        process.exit(1)
    }
    console.log(`[fingerprint] ✓ event-distinct fingerprints: '${main.conversionEventName}' ≠ 'lead' → different fingerprints`)

    // ── 9. Day-grain rows get periodDateLocal populated ──
    // Build a synthetic daily row and verify periodDateLocal is set.
    const dailyCsv = `שם הקמפיין,תקופת הדיווח: התחלה,תקופת הדיווח: סיום,צפיות,קליקים על הקישור,סכום שהוצא (ILS),תוצאות,אינדיקטור התוצאה
"קמפיין יום אחד",2026-03-15,2026-03-15,500,20,75.00,3,leads
`
    const dailyParsed = parseCsv(Buffer.from(dailyCsv, 'utf-8'))
    const dailyMapped = metaAdsCsvMapper.map(dailyParsed.rows, {
        sourceType: 'meta_ads_csv', classifier, filename: 'daily-test.csv',
    })
    const { rows: dailyNormalized } = await processRows(dailyMapped)
    if (dailyNormalized.length !== 1) {
        console.error(`FAIL: daily row should normalize, got ${dailyNormalized.length} rows`)
        process.exit(1)
    }
    if (dailyNormalized[0].periodDateLocal !== '2026-03-15') {
        console.error(`FAIL: daily-grain row should have periodDateLocal='2026-03-15', got '${dailyNormalized[0].periodDateLocal}'`)
        process.exit(1)
    }
    if (dailyNormalized[0].periodGrain !== 'day') {
        console.error(`FAIL: daily-grain row should have periodGrain='day', got '${dailyNormalized[0].periodGrain}'`)
        process.exit(1)
    }
    console.log(`[day-grain] ✓ periodDateLocal='${dailyNormalized[0].periodDateLocal}' periodGrain='${dailyNormalized[0].periodGrain}'`)

    console.log('\n=== ALL ASSERTIONS PASS ✓ ===')
    console.log('Pipeline: parse → mapper → validate → normalize → attribution-aware fingerprint works.')
    console.log('Note: prorate-by-overlap logic lives in aggregate.ts (SQL) — verified via integration test post-deploy.')
}

main().catch(err => {
    console.error('Test crashed:', err)
    process.exit(1)
})