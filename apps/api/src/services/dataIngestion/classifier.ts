/**
 * Source classifier — identifies what an uploaded file *is* before we try
 * to map it. A 1-shot Sonnet call given the first ~200 lines (CSV) or the
 * first 4 pages (PDF as Vision images) or one screenshot.
 *
 * Why a model and not a regex: column headers in Hebrew ad-platform exports
 * vary across years/UI versions, file extensions lie (Looker exports a PDF
 * but it's really a tabular dashboard screenshot), and users sometimes
 * paste a screenshot of a Google Ads UI table into a doc and export to PDF.
 * A small VLM call is cheaper than maintaining 30 heuristic header maps.
 *
 * Cost: one Sonnet call per uploaded file, ~$0.003-0.01 each. Acceptable —
 * users upload 1-15 files per onboarding then never again.
 */

import { getApiKeyForInstance } from '@/controllers/hosting/agentSetup'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const CLASSIFIER_MODEL = 'claude-sonnet-4-6'

export type SourceType =
    | 'meta_ads_csv'
    | 'google_ads_csv'
    | 'ga4_export_csv'
    | 'gsc_export_csv'
    | 'looker_studio_pdf'
    | 'screenshot_dashboard'
    | 'tiktok_ads_csv'
    | 'microsoft_ads_csv'
    | 'generic_csv'
    | 'unknown'

export interface ClassifierOutput {
    detectedSource: SourceType
    /** 0..1 — how sure the classifier is. <0.6 = caller should treat as generic_csv. */
    confidence: number
    /** Why the classifier chose this — short bullets. Surfaced in source_meta for audit. */
    evidence: string[]
    /** Inferred date range if detectable from filename / first rows. ISO strings. */
    dateRange?: { start: string; end: string }
    /** Rows the source declares (CSV row count minus header, or PDF table row count). */
    rowsCount: number
    /** Currency code if detectable (USD/ILS/EUR/...). */
    currency?: string
    /** Soft warnings for the user: 'malformed_header' | 'mixed_grain' | 'no_date_column' | etc. */
    warnings: string[]
}

interface ClassifyInput {
    instanceId: string
    filename: string
    mimeType: string
    /** Already-base64-decoded buffer. */
    buffer: Buffer
}

// ─── First 200 lines of CSV for the prompt ─────────────────────────────────
function csvPreview(buffer: Buffer, maxLines = 200): { preview: string; rowsTotal: number } {
    const text = buffer.toString('utf-8')
    const lines = text.split(/\r?\n/)
    const rowsTotal = Math.max(0, lines.filter(l => l.trim().length > 0).length - 1)  // minus header
    return {
        preview: lines.slice(0, maxLines).join('\n'),
        rowsTotal,
    }
}

// ─── Build the classification prompt ──────────────────────────────────────
function buildPrompt(input: ClassifyInput, preview: string, rowsTotal: number): string {
    return `You are a data-source classifier for an Israeli marketing analytics platform. Identify what kind of export the user uploaded.

File metadata:
- filename: ${input.filename}
- mime: ${input.mimeType}
- declared rows (CSV): ${rowsTotal}

File preview (first lines):
\`\`\`
${preview.slice(0, 25_000)}
\`\`\`

Decide which of these source types it is:
- meta_ads_csv          — Meta Ads Manager export (Facebook/Instagram). Headers like: "שם הקמפיין"/"Campaign name", "צפיות"/"Impressions", "קליקים על קישור"/"Link clicks", "סכום שהוצא (ILS)"/"Amount spent", "תוצאות"/"Results", "הצעת מחיר"/"Bid amount".
- google_ads_csv        — Google Ads export. Headers like: "Campaign"/"קמפיין", "Cost"/"עלות", "Impr."/"חשיפות", "Clicks"/"קליקים", "Conv."/"המרות", "CTR", "Avg. CPC", "Conv. value/cost".
- ga4_export_csv        — Google Analytics 4 export. "Event name", "Event count", "Active users", "Conversions", "Engagement rate", "Session source / medium".
- gsc_export_csv        — Google Search Console export. "Query"/"Page"/"Country", "Clicks", "Impressions", "CTR", "Position".
- looker_studio_pdf     — Multi-source dashboard PDF (will say "Looker Studio" or "Google Data Studio" in margin).
- screenshot_dashboard  — A screenshot of an ad UI rather than an export. (PNG/JPG mime.)
- tiktok_ads_csv        — TikTok Ads Manager export. "Ad group name", "Cost", "Impressions", "Clicks", "Conversions" + TikTok-specific columns like "Video views (6s)".
- microsoft_ads_csv     — Microsoft Advertising (Bing). Similar to Google Ads but with "Quality score" + "Top vs. Other".
- generic_csv           — A CSV that has tabular data but doesn't match any of the above.
- unknown               — Cannot determine.

Also extract:
- date_range: if you can see a date column or filename hint (e.g. "26-2-2026"), report start+end as ISO YYYY-MM-DD.
- currency: from header ("ILS", "USD", "₪", "$") if visible.
- warnings: anything that would degrade later mapping — e.g. "header is in Hebrew with prefix letters", "mixed daily and lifetime rows in same file", "no date column visible".

Return STRICT JSON, no prose:
{
  "detectedSource": "<one of the above>",
  "confidence": 0.0-1.0,
  "evidence": ["short bullet", "short bullet"],
  "dateRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } | null,
  "currency": "ILS" | "USD" | "EUR" | null,
  "warnings": ["...", "..."]
}`
}

// ─── Strict JSON parse ────────────────────────────────────────────────────
function tryParseJson(s: string): unknown {
    // Strip markdown code fences if model wrapped output
    const cleaned = s.replace(/^\s*```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
    try { return JSON.parse(cleaned) }
    catch { /* fall through */ }
    // Last-resort: extract first JSON object
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (m) try { return JSON.parse(m[0]) } catch { /* noop */ }
    return null
}

// ─── Run classifier ───────────────────────────────────────────────────────
export async function classifyFile(input: ClassifyInput): Promise<ClassifierOutput> {
    const apiKey = await getApiKeyForInstance(input.instanceId)
    if (!apiKey) {
        return {
            detectedSource: 'unknown',
            confidence: 0,
            evidence: ['no Anthropic API key — classifier disabled'],
            rowsCount: 0,
            warnings: ['classifier_skipped_no_api_key'],
        }
    }

    // Build preview based on mime type. For PDFs/images we currently only
    // pass filename + mime (PDF page-as-image Vision path comes in Phase 1b);
    // CSVs get a real preview.
    const isCsv = /csv|excel|spreadsheet/i.test(input.mimeType) || /\.csv$/i.test(input.filename)
    const isImage = /^image\//i.test(input.mimeType)
    const isPdf = /pdf/i.test(input.mimeType)

    let preview = ''
    let rowsTotal = 0
    if (isCsv) {
        const p = csvPreview(input.buffer)
        preview = p.preview
        rowsTotal = p.rowsTotal
    } else if (isImage) {
        preview = `[binary image: ${input.buffer.length} bytes, mime=${input.mimeType}]`
        rowsTotal = 0
    } else if (isPdf) {
        preview = `[binary PDF: ${input.buffer.length} bytes — page-text extraction pending]`
        rowsTotal = 0
    } else {
        preview = `[unknown mime: ${input.mimeType}, ${input.buffer.length} bytes]`
        rowsTotal = 0
    }

    const userPrompt = buildPrompt(input, preview, rowsTotal)

    try {
        const res = await fetch(ANTHROPIC_URL, {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                model: CLASSIFIER_MODEL,
                max_tokens: 800,
                messages: [{ role: 'user', content: userPrompt }],
            }),
            signal: AbortSignal.timeout(45_000),
        })
        if (!res.ok) {
            const t = await res.text().catch(() => '')
            console.warn(`[dataIngestion/classifier] Sonnet ${res.status}: ${t.slice(0, 200)}`)
            return {
                detectedSource: 'unknown',
                confidence: 0,
                evidence: [`classifier API ${res.status}`],
                rowsCount: rowsTotal,
                warnings: ['classifier_api_error'],
            }
        }
        const j = await res.json() as any
        const text = j?.content?.[0]?.text
        if (typeof text !== 'string') {
            return {
                detectedSource: 'unknown',
                confidence: 0,
                evidence: ['classifier returned no text'],
                rowsCount: rowsTotal,
                warnings: ['classifier_empty_response'],
            }
        }
        const parsed = tryParseJson(text) as any
        if (!parsed || typeof parsed !== 'object') {
            return {
                detectedSource: 'unknown',
                confidence: 0,
                evidence: ['classifier output not parseable', text.slice(0, 200)],
                rowsCount: rowsTotal,
                warnings: ['classifier_invalid_json'],
            }
        }

        const detected = String(parsed.detectedSource || 'unknown') as SourceType
        const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0))
        const evidence = Array.isArray(parsed.evidence)
            ? parsed.evidence.slice(0, 8).map((x: any) => String(x))
            : []
        const warnings = Array.isArray(parsed.warnings)
            ? parsed.warnings.slice(0, 8).map((x: any) => String(x))
            : []
        const dateRange = parsed.dateRange?.start && parsed.dateRange?.end
            ? { start: String(parsed.dateRange.start), end: String(parsed.dateRange.end) }
            : undefined
        const currency = typeof parsed.currency === 'string' ? parsed.currency : undefined

        return {
            detectedSource: detected,
            confidence,
            evidence,
            dateRange,
            currency,
            rowsCount: rowsTotal,
            warnings,
        }
    } catch (err) {
        console.error('[dataIngestion/classifier] error:', (err as Error).message)
        return {
            detectedSource: 'unknown',
            confidence: 0,
            evidence: [`classifier threw: ${(err as Error).message}`],
            rowsCount: rowsTotal,
            warnings: ['classifier_exception'],
        }
    }
}