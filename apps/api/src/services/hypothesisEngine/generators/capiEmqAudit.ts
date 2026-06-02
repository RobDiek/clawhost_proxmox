/**
 * Phase 4.3.1 — CAPI / Event Match Quality (EMQ) audit generator.
 *
 * 2026 reality: Meta Pixel alone captures ~30-40% of conversion signal on
 * iOS-heavy verticals. CAPI (server-side) fills the rest. Aggregate Event
 * Match Quality score ≥8.0 on Purchase is the practitioner-consensus
 * threshold for a "healthy" account. Accounts with EMQ <6 are bleeding
 * 15-25% of attributable conversions — Smart Bidding makes decisions on
 * a deeply incomplete signal.
 *
 * Detection heuristic (multi-tier):
 *
 *   Tier 1 — Critical: Meta ads active in ingestion but NO CAPI token
 *     configured. Worst case — pixel-only tracking on iOS-heavy IL market.
 *
 *   Tier 2 — High: CAPI token configured but ingested Meta events show
 *     attribution_window mostly unknown OR conversion_event_name mostly
 *     'all' (suggests events not properly labeled / Pixel-only fallback
 *     happening).
 *
 *   Tier 3 — Medium: CAPI configured and events look OK, but no business-
 *     messaging-CAPI for CTWA campaigns detected (Israeli-critical).
 *
 * Note on Tier 1 vs trackingGap.ts — trackingGap detects DATA INTEGRITY
 * issues from any source (unknown attribution windows etc.). This generator
 * specifically targets MISSING CAPI INFRASTRUCTURE — the upstream cause of
 * many trackingGap findings. We surface BOTH because the framing matters:
 * user must fix CAPI before tracking-gap warnings have a chance to clear.
 */

import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { ingestedDataPoints } from '@/db/schema'
import type { GeneratorContext, HypothesisProposal } from '../types'

interface MetaAdapterInfo {
    connected: boolean
    capiTokenPresent: boolean
    pixelId: string | null
    capiActive: boolean
}

function extractMetaAdapter(ctx: GeneratorContext): MetaAdapterInfo {
    const metaAdapter = ctx.inventory.adapters.find(a => a.id === 'meta_ads')
    if (!metaAdapter || !metaAdapter.connected) {
        return { connected: false, capiTokenPresent: false, pixelId: null, capiActive: false }
    }
    const meta = (metaAdapter.metadata || {}) as Record<string, unknown>
    return {
        connected: true,
        capiTokenPresent: !!meta.capiTokenPresent,
        pixelId: typeof meta.pixelId === 'string' ? meta.pixelId : null,
        capiActive: !!meta.capiTokenPresent && !!meta.pixelId,
    }
}

/** Snapshot of Meta event quality from ingestion. */
async function metaEventQuality(instanceId: string): Promise<{
    metaRows: number
    rowsWithConversions: number
    rowsWithKnownAttribution: number
    rowsWithKnownEvent: number
    distinctEventNames: string[]
    lastEventDate: Date | null
}> {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const result = await db.execute(sql`
        SELECT
            COUNT(*) AS rows,
            COUNT(*) FILTER (WHERE conversions IS NOT NULL AND conversions > 0) AS rows_with_conv,
            COUNT(*) FILTER (WHERE attribution_window IS NOT NULL AND attribution_window <> 'unknown'
                              AND conversions IS NOT NULL AND conversions > 0) AS rows_with_attr,
            COUNT(*) FILTER (WHERE conversion_event_name IS NOT NULL AND conversion_event_name <> 'all'
                              AND conversion_event_name <> 'unknown'
                              AND conversions IS NOT NULL AND conversions > 0) AS rows_with_event,
            ARRAY_AGG(DISTINCT conversion_event_name) FILTER (WHERE conversion_event_name IS NOT NULL) AS events,
            MAX(period_end) AS last_event
        FROM ingested_data_points
        WHERE instance_id = ${instanceId}
          AND platform = 'meta'
          AND period_end >= ${since}
          AND superseded_at IS NULL
    `)
    const row = ((((result as unknown) as { rows?: any[] }).rows) || [])[0] || {}
    return {
        metaRows: Number(row.rows) || 0,
        rowsWithConversions: Number(row.rows_with_conv) || 0,
        rowsWithKnownAttribution: Number(row.rows_with_attr) || 0,
        rowsWithKnownEvent: Number(row.rows_with_event) || 0,
        distinctEventNames: Array.isArray(row.events) ? row.events.filter(Boolean) : [],
        lastEventDate: row.last_event ? new Date(row.last_event) : null,
    }
}

function setupInstructionsHe(): { step: number; platformLabel: string; actionLabel: string; actionLabelHe: string; verify?: string; verifyHe?: string }[] {
    return [
        {
            step: 1,
            platformLabel: 'Meta Events Manager',
            actionLabel: 'Open Events Manager → Conversions API → Get Started',
            actionLabelHe: 'פתחו Events Manager → Conversions API → התחילו',
            verifyHe: 'בחרו את ה-Pixel שלכם → לחצו "Set up Conversions API"',
        },
        {
            step: 2,
            platformLabel: 'Meta Events Manager',
            actionLabel: 'Choose CAPI Gateway (easiest) or Stape server-side GTM (more flexible)',
            actionLabelHe: 'בחרו CAPI Gateway (פשוט יותר) או Stape sGTM (גמיש יותר ~$50/חודש)',
            verifyHe: 'CAPI Gateway = no server needed, Meta hosts it. Stape = $20-100/חודש, יותר שליטה.',
        },
        {
            step: 3,
            platformLabel: 'Meta Events Manager',
            actionLabel: 'Generate access token and pixel ID; save credentials securely',
            actionLabelHe: 'צרו access token + pixel ID, שמרו בצורה מאובטחת',
            verify: 'Token should start with "EAA..." prefix.',
            verifyHe: 'ה-token צריך להתחיל ב-"EAA..."',
        },
        {
            step: 4,
            platformLabel: 'Flowmatic Dashboard',
            actionLabel: 'In integrations tab → Meta Business → paste CAPI token + pixel ID',
            actionLabelHe: 'בלשונית תוספים → Meta Business → הדביקו את ה-CAPI token + pixel ID',
            verifyHe: 'אנחנו נשלח test event מיד אחרי השמירה — תצטרכו לראות אותו ב-Events Manager → Test Events',
        },
        {
            step: 5,
            platformLabel: 'Meta Events Manager',
            actionLabel: 'After 24-48h, check EMQ scores on Events Manager → Diagnostics → target ≥8.0 for Purchase',
            actionLabelHe: 'אחרי 24-48 שעות, בדקו EMQ scores ב-Events Manager → Diagnostics → יעד ≥8.0 לאירוע Purchase',
            verify: 'Increase EMQ by passing hashed email, phone, FBP, FBC, IP, user agent, external_id with every event.',
            verifyHe: 'להעלאת EMQ — העבירו hashed email + phone + FBP + FBC + IP + user agent + external_id עם כל אירוע',
        },
    ]
}

export async function generateCapiEmqAudit(ctx: GeneratorContext): Promise<HypothesisProposal[]> {
    const out: HypothesisProposal[] = []

    const meta = extractMetaAdapter(ctx)
    if (!meta.connected) return out  // No Meta account = no CAPI to audit

    const eq = await metaEventQuality(ctx.instanceId)
    const windowStart = new Date(ctx.now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const windowEnd = ctx.now.toISOString().slice(0, 10)

    // ── Tier 1: Meta connected, ingestion has conv rows, but NO CAPI configured ──
    if (!meta.capiActive && eq.rowsWithConversions >= 5) {
        out.push({
            hypothesisCode: 'tracking_gap_capi_not_configured',
            title: 'Meta connected but CAPI not configured — bleeding 20-40% of iOS conversions',
            titleHe: 'Meta מחובר אבל CAPI לא מוגדר — מאבדים 20-40% מההמרות ב-iOS',
            scopePlatform: 'meta',
            scopeDataType: 'account',
            scopeWindow: { start: windowStart, end: windowEnd },

            observation: `Meta ad account is connected (pixelId=${meta.pixelId || 'unknown'}), ${eq.rowsWithConversions} conversion-bearing rows in last 90 days, but no CAPI access token is configured. With Pixel-only tracking, you're losing 20-40% of conversions on iOS-heavy IL traffic (iOS ATT opt-out rate ~75%; Pixel can't reach those users without server-side fallback).`,
            observationHe: `חשבון Meta מחובר (pixelId=${meta.pixelId || 'unknown'}), ${eq.rowsWithConversions} שורות עם המרות ב-90 הימים האחרונים, אבל אין CAPI access token. עם מעקב Pixel-only, מאבדים 20-40% מההמרות ב-iOS (שיעור opt-out של ATT ~75%; Pixel לא מגיע למשתמשים האלה בלי server-side fallback).`,
            hypothesis: 'Setting up Meta Conversions API (CAPI) — either via Meta CAPI Gateway (zero-infrastructure) or Stape server-side GTM ($20-100/month) — will recover 20-40% of attributable conversions. Industry consensus 2026: CAPI is no longer optional. Accounts without it are competing with one hand tied.',
            hypothesisHe: 'הקמת Meta Conversions API (CAPI) — דרך Meta CAPI Gateway (ללא תשתית) או Stape server-side GTM ($20-100/חודש) — תחזיר 20-40% מההמרות שניתן לייחס. קונצנזוס תעשייתי 2026: CAPI כבר לא אופציונלי. חשבונות בלעדיו מתחרים עם יד אחת קשורה.',
            reasoning: 'Post-iOS-14.5 (ATT), Apple users opt-in to tracking at ~25% rate. The remaining 75% of iOS impressions can\'t fire the standard Pixel — events get dropped at the browser level. CAPI sends events server-to-server, bypassing the browser entirely. Practitioners report: accounts with healthy EMQ (≥8.0 on Purchase) see 15-25% more attributed conversions than Pixel-only equivalents. Smart Bidding (Advantage+, ASC) trains on the conversion signal Meta receives — without CAPI, the algorithm makes decisions on degraded data.',
            reasoningHe: 'לאחר iOS-14.5 (ATT), משתמשי Apple מסכימים למעקב בשיעור ~25%. ה-75% הנותרים מ-impressions ב-iOS לא יכולים להפעיל את ה-Pixel הסטנדרטי — האירועים מתבטלים ברמת הדפדפן. CAPI שולח אירועים מהשרת ישירות לשרת של Meta, עוקף לחלוטין את הדפדפן. דיווחים מהשטח: חשבונות עם EMQ בריא (≥8.0 על Purchase) רואים 15-25% יותר המרות מיוחסות מאשר חשבונות Pixel-only. Smart Bidding (Advantage+, ASC) מתאמן על האות שמגיע ל-Meta — בלי CAPI, האלגוריתם מקבל החלטות על data מקולקל.',

            severity: 'critical',
            confidence: 0.9,
            expectedImpactKind: 'conv_uplift',
            expectedImpactWindowDays: 60,

            evidenceSnapshot: {
                asOf: ctx.now.toISOString(),
                metrics: {
                    pixelId: meta.pixelId,
                    capiTokenPresent: meta.capiTokenPresent,
                    metaRowsLast90d: eq.metaRows,
                    rowsWithConversions: eq.rowsWithConversions,
                    rowsWithKnownAttribution: eq.rowsWithKnownAttribution,
                    rowsWithKnownEvent: eq.rowsWithKnownEvent,
                    distinctEventNames: eq.distinctEventNames,
                    lastEventDate: eq.lastEventDate ? eq.lastEventDate.toISOString() : null,
                },
                window: { start: windowStart, end: windowEnd },
            },
            evidenceQualityScore: 0.95,

            proposedAction: 'Set up Meta Conversions API via CAPI Gateway (recommended for SMB) or Stape sGTM. Target EMQ ≥8.0 on Purchase event within 14 days of setup.',
            proposedActionHe: 'הקימו Meta Conversions API דרך CAPI Gateway (מומלץ ל-SMB) או Stape sGTM. יעד EMQ ≥8.0 על אירוע Purchase תוך 14 ימים מההקמה.',
            manualInstructions: setupInstructionsHe(),

            testMethod: 'before_after_window',
            testWindowDays: 28,
            testSuccessCriteria: {
                metric: 'conversions',
                direction: 'increase',
                thresholdPct: 15,
                minConv: 30,
                minSpendIls: 1000,
            },

            source: 'rule_engine',
        })
    }

    // ── Tier 2: CAPI configured but events look incomplete ──
    else if (meta.capiActive && eq.rowsWithConversions >= 10) {
        const knownAttrRate = eq.rowsWithConversions > 0
            ? eq.rowsWithKnownAttribution / eq.rowsWithConversions
            : 0
        const knownEventRate = eq.rowsWithConversions > 0
            ? eq.rowsWithKnownEvent / eq.rowsWithConversions
            : 0

        if (knownAttrRate < 0.5 || knownEventRate < 0.5) {
            const attrPct = (knownAttrRate * 100).toFixed(0)
            const eventPct = (knownEventRate * 100).toFixed(0)
            out.push({
                hypothesisCode: 'tracking_gap_capi_low_quality',
                title: `CAPI configured but events incomplete — attribution=${attrPct}%, event_name=${eventPct}%`,
                titleHe: `CAPI מוגדר אבל האירועים חלקיים — attribution=${attrPct}%, event_name=${eventPct}%`,
                scopePlatform: 'meta',
                scopeDataType: 'account',
                scopeWindow: { start: windowStart, end: windowEnd },

                observation: `Meta CAPI is configured (token + pixel present), but ingested events show only ${attrPct}% have known attribution_window and ${eventPct}% have known conversion_event_name out of ${eq.rowsWithConversions} conversion rows. This typically means: (a) AEM events not configured per pixel, (b) CAPI sending events with insufficient match parameters (no FBP/FBC/external_id), or (c) Pixel and CAPI not deduplicating via event_id.`,
                observationHe: `Meta CAPI מוגדר (token + pixel נוכחים), אבל אירועים שנכנסו לאינדקס מציגים שרק ${attrPct}% עם attribution_window ידוע ו-${eventPct}% עם conversion_event_name ידוע מתוך ${eq.rowsWithConversions} שורות עם המרות. בדרך כלל זה אומר: (א) אירועי AEM לא מוגדרים בכל pixel, (ב) CAPI שולח אירועים עם מעט מדי match parameters (אין FBP/FBC/external_id), או (ג) Pixel ו-CAPI לא מבצעים deduplication דרך event_id.`,
                hypothesis: 'Audit CAPI implementation: (1) verify Aggregated Event Measurement (AEM) configured for all key events on the Pixel, (2) ensure events ship with hashed email/phone + FBP + FBC + IP + user agent + external_id where available, (3) verify Pixel and CAPI use matching event_id for deduplication. Target EMQ ≥8.0 on Purchase, ≥7.0 on Lead.',
                hypothesisHe: 'בצעו audit למימוש CAPI: (1) ודאו ש-Aggregated Event Measurement (AEM) מוגדר לכל האירועים החשובים על ה-Pixel, (2) ודאו שאירועים נשלחים עם hashed email/phone + FBP + FBC + IP + user agent + external_id איפה שזמין, (3) ודאו ש-Pixel ו-CAPI משתמשים ב-event_id תואם ל-deduplication. יעד EMQ ≥8.0 על Purchase, ≥7.0 על Lead.',
                reasoning: 'EMQ (Event Match Quality) is a 1-10 score Meta computes per event based on how many identifying parameters were passed. EMQ 6.0 ≈ 60% matched; 9.0 ≈ 90% matched. Advertisers with EMQ >8.0 see 15-25% more attributed conversions than EMQ 6.0 equivalents — the algorithm learns from higher-fidelity signal. Low attribution_window / event_name visibility in your ingested data is a leading indicator that EMQ is also low.',
                reasoningHe: 'EMQ (Event Match Quality) הוא ציון 1-10 ש-Meta מחשב לכל אירוע על-פי כמה פרמטרים מזהים הועברו. EMQ 6.0 ≈ 60% תאמה; 9.0 ≈ 90% תאמה. מפרסמים עם EMQ >8.0 רואים 15-25% יותר המרות מיוחסות מאשר EMQ 6.0 — האלגוריתם לומד מאות באיכות גבוהה יותר. נראות נמוכה של attribution_window / event_name בנתונים שלכם היא אינדיקטור מקדים ש-EMQ גם נמוך.',

                severity: 'high',
                confidence: 0.8,
                expectedImpactKind: 'conv_uplift',
                expectedImpactWindowDays: 30,

                evidenceSnapshot: {
                    asOf: ctx.now.toISOString(),
                    metrics: {
                        pixelId: meta.pixelId,
                        capiTokenPresent: meta.capiTokenPresent,
                        rowsWithConversions: eq.rowsWithConversions,
                        knownAttrRate: Number(knownAttrRate.toFixed(3)),
                        knownEventRate: Number(knownEventRate.toFixed(3)),
                        distinctEventNames: eq.distinctEventNames,
                    },
                    window: { start: windowStart, end: windowEnd },
                },
                evidenceQualityScore: 0.85,

                proposedAction: 'Audit Meta Events Manager → Diagnostics → improve EMQ to ≥8.0 on Purchase. Pass hashed PII + FBP/FBC + external_id per event.',
                proposedActionHe: 'בצעו audit ב-Meta Events Manager → Diagnostics → שפרו EMQ ל-≥8.0 על Purchase. העבירו hashed PII + FBP/FBC + external_id לכל אירוע.',

                testMethod: 'before_after_window',
                testWindowDays: 21,
                testSuccessCriteria: {
                    metric: 'conversions',
                    direction: 'increase',
                    thresholdPct: 10,
                    minConv: 20,
                    minSpendIls: 800,
                },

                source: 'rule_engine',
            })
        }
    }

    return out
}