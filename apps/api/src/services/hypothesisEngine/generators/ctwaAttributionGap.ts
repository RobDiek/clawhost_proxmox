/**
 * Phase 4.5 generator — Click-to-WhatsApp (CTWA) attribution gap.
 *
 * IL-specific: WhatsApp is the dominant consumer-to-business channel in
 * Israel and ~40-60% of Meta paid spend in SMB accounts flows to CTWA
 * campaigns. The conversion event Meta reports for CTWA is
 * `messaging_conversation_started` — but unless the business has the
 * WhatsApp Business API connected to a server-side event sink, GA4 has
 * no visibility into downstream conversions (qualified-lead, purchase,
 * appointment booked).
 *
 * Result: the agency sees "great Meta ROAS!" while GA4 + actual revenue
 * tell a different story. This generator catches the gap by comparing
 * Meta's messaging-conversation count to any GA4-reported WhatsApp /
 * lead conversions; when Meta reports volume but GA4 sees ~zero, the
 * funnel is dark beyond the first touch.
 *
 * Signal: per-event aggregate has `messaging_conversation_started` on
 * Meta with significant volume AND no GA4-side lead/whatsapp events
 * for the same window.
 */

import type { GeneratorContext, HypothesisProposal } from '../types'

const META_MESSAGING_EVENTS = new Set([
    'messaging_conversation_started',
    'messaging_first_reply',
    'messaging_block',
    'messaging_user_subscribed',
    'onsite_conversion.messaging_conversation_started_7d',
])

// GA4 event names that would indicate downstream WhatsApp conversion if tracked.
const GA4_WHATSAPP_OR_LEAD_EVENTS = new Set([
    'whatsapp',
    'whatsapp_click',
    'whatsapp_message_sent',
    'whatsapp_conversation',
    'lead',
    'generate_lead',
    'qualified_lead',
    'contact',
    'submit_form',
    'phone_call',
])

const MIN_META_MESSAGING_VOLUME = 20         // need at least 20 conversation-starts to make a call

export async function generateCtwaAttributionGap(ctx: GeneratorContext): Promise<HypothesisProposal[]> {
    const out: HypothesisProposal[] = []
    if (!ctx.eventBreakdown || ctx.eventBreakdown.length === 0) return out

    let metaMessagingConv = 0
    let metaMessagingSpend = 0
    let ga4LeadConv = 0
    let metaPixelConv = 0      // non-messaging Meta conversions (purchase / lead via web)

    for (const ev of ctx.eventBreakdown) {
        const en = (ev.eventName || '').toLowerCase()
        if (ev.platform === 'meta') {
            if (META_MESSAGING_EVENTS.has(en)) {
                metaMessagingConv += ev.conversions
                metaMessagingSpend += ev.spendIls
            } else {
                metaPixelConv += ev.conversions
            }
        } else if (ev.platform === 'ga4') {
            if (GA4_WHATSAPP_OR_LEAD_EVENTS.has(en) || en.includes('whatsapp') || en.includes('lead')) {
                ga4LeadConv += ev.conversions
            }
        }
    }

    if (metaMessagingConv < MIN_META_MESSAGING_VOLUME) return out

    // The gap heuristic: messaging volume vs ga4-observed lead/whatsapp events.
    // If Meta sees 100 messaging-started but GA4 sees 5 leads/whatsapp events
    // for the SAME window, ~95% of the funnel is dark beyond first contact.
    const observedRatio = ga4LeadConv / metaMessagingConv
    const observedSharePct = observedRatio * 100

    // Skip if observed share is healthy (>30% — every messaging start translates
    // to a tracked lead reasonably well) — that means user has the integration.
    if (observedSharePct > 30) return out

    // Skip when there's no GA4 connected at all — that's a different problem
    // (lack of observed channel), surfaced by Phase 4.3 generators already.
    const ga4Connected = ctx.inventory.adapters.some(a => a.id === 'ga4' && a.connected)
    if (!ga4Connected) return out

    const severity = observedSharePct < 5 ? 'critical' : observedSharePct < 15 ? 'high' : 'medium'
    const windowStart = new Date(ctx.now.getTime() - 90 * 86400 * 1000).toISOString()
    const windowEnd = ctx.now.toISOString()

    out.push({
        hypothesisCode: 'ctwa_attribution_gap',
        title: `WhatsApp funnel is dark: ${metaMessagingConv} messaging starts → only ${ga4LeadConv} tracked leads`,
        titleHe: `המסע ב-WhatsApp לא במעקב: ${metaMessagingConv} שיחות התחילו → רק ${ga4LeadConv} לידים בתיוג`,
        scopePlatform: 'meta',
        scopeDataType: 'account',
        scopeWindow: { start: windowStart, end: windowEnd },
        observation:
            `Meta CTWA campaigns generated ${metaMessagingConv} messaging conversation starts and ₪${Math.round(metaMessagingSpend)} of spend ` +
            `in the last 90 days. GA4 saw only ${ga4LeadConv} downstream lead/WhatsApp events (~${observedSharePct.toFixed(1)}%). ` +
            `The funnel after first contact is invisible — qualified leads, appointments, and revenue are not flowing back.`,
        observationHe:
            `קמפיינים מסוג CTWA במטא הניבו ${metaMessagingConv} פתיחות שיחה ב-WhatsApp עם הוצאה של ₪${Math.round(metaMessagingSpend)} ב-90 הימים האחרונים. ` +
            `GA4 ראה רק ${ga4LeadConv} אירועי ליד/WhatsApp נמשכים (~${observedSharePct.toFixed(1)}%). ` +
            `המשפך אחרי המגע הראשון לא נראה — לידים איכותיים, פגישות והכנסה לא חוזרים למערכת.`,
        hypothesis:
            `Connecting the WhatsApp Business API (or at minimum: a lead-quality tag in your CRM that fires a GA4 measurement-protocol ` +
            `event when a chat converts to a qualified lead) will close the attribution loop. Without it, Meta optimizes on conversations ` +
            `that don't reflect business value — wasting 30-50% of CTWA budget on low-intent chats.`,
        hypothesisHe:
            'חיבור WhatsApp Business API (או לפחות: תיוג איכות ליד ב-CRM שיורה אירוע GA4 כשצ׳אט הופך לליד איכותי) ' +
            `יסגור את לולאת הייחוס. בלעדיו, מטא מבצעת אופטימיזציה לשיחות שלא משקפות ערך עסקי — ` +
            `מבזבזת 30-50% מתקציב ה-CTWA על שיחות בכוונה נמוכה.`,
        reasoning:
            `Israeli SMB CTWA pattern: high volume of "just looking" chats from Meta's broad audiences, low conversion to qualified leads. ` +
            `Meta's algorithm reports conversation_started as the success event, so it keeps optimizing for more of them — even when they ` +
            `produce zero qualified leads. The fix is server-side: WhatsApp Business API → CRM webhook → GA4 measurement protocol event ` +
            `→ Meta CAPI custom event. Then Meta optimizes for qualified-leads, not raw chats.`,
        reasoningHe:
            `דפוס CTWA בעסקים קטנים בישראל: נפח גבוה של שיחות "סתם מסתכל" מקהלים רחבים של מטא, המרה נמוכה ללידים איכותיים. ` +
            `האלגוריתם של מטא מדווח על פתיחת שיחה כאירוע ההצלחה, אז הוא ממשיך לבצע אופטימיזציה ליותר ויותר מהן — גם כשהן ` +
            `מניבות אפס לידים איכותיים. הפתרון בצד-שרת: WhatsApp Business API → webhook ל-CRM → אירוע GA4 measurement protocol ` +
            `→ אירוע CAPI מותאם במטא. אז מטא מבצעת אופטימיזציה ללידים איכותיים, לא לשיחות גולמיות.`,
        severity,
        confidence: 0.85,
        expectedImpactKind: 'cpa_reduction',
        expectedImpactWindowDays: 30,
        evidenceSnapshot: {
            asOf: ctx.now.toISOString(),
            window: { start: windowStart, end: windowEnd },
            metrics: {
                metaMessagingConv,
                metaMessagingSpendIls: metaMessagingSpend,
                metaPixelConv,
                ga4LeadConv,
                observedSharePct,
                ga4Connected,
            },
        },
        proposedAction:
            'Set up WhatsApp Business API → CRM → GA4/CAPI chain. Until then, Meta is optimizing on a vanity metric and the agency cannot prove ROI.',
        proposedActionHe:
            `הקימו את שרשרת WhatsApp Business API → CRM → GA4/CAPI. עד אז, מטא מבצעת אופטימיזציה למדד גאווה והסוכנות לא יכולה להוכיח ROI.`,
        manualInstructions: [
            {
                step: 1,
                platformLabel: 'Meta WhatsApp Business',
                actionLabel: 'Apply for WhatsApp Business API access (requires Business Verification on Meta Business Suite)',
                actionLabelHe: 'הגישו בקשה לגישה ל-WhatsApp Business API (דורש Business Verification ב-Meta Business Suite)',
                screenshotHint: 'business.facebook.com → Settings → WhatsApp accounts',
            },
            {
                step: 2,
                platformLabel: 'WhatsApp BSP',
                actionLabel: 'Pick a BSP: 360dialog, Twilio, or Meta Cloud API. Connect to a CRM (HubSpot/Pipedrive)',
                actionLabelHe: 'בחרו BSP: 360dialog, Twilio או Meta Cloud API. חברו ל-CRM (HubSpot/Pipedrive)',
            },
            {
                step: 3,
                platformLabel: 'CRM',
                actionLabel: 'Define lead-quality criteria + tag conversations as qualified vs unqualified',
                actionLabelHe: 'הגדירו קריטריוני איכות ליד + תייגו שיחות כ-qualified/unqualified',
            },
            {
                step: 4,
                platformLabel: 'GA4 Admin',
                actionLabel: 'Create a Measurement Protocol secret. When CRM tags a lead "qualified", fire GA4 event "qualified_lead"',
                actionLabelHe: 'צרו Measurement Protocol secret ב-GA4. כשה-CRM מתייג ליד כ-qualified, ירו אירוע "qualified_lead"',
            },
            {
                step: 5,
                platformLabel: 'Meta Events Manager',
                actionLabel: 'Add a CAPI custom event "Qualified Lead". Then update CTWA campaigns to optimize for it instead of messaging_started',
                actionLabelHe: 'הוסיפו אירוע CAPI מותאם "Qualified Lead". עדכנו את קמפייני ה-CTWA לבצע אופטימיזציה אליו במקום messaging_started',
                verifyHe: 'באירועי ה-Manager תראו את האירוע מתעדכן עם Server events ולא רק Browser.',
            },
        ],
        testMethod: 'before_after_window',
        testWindowDays: 30,
        testSuccessCriteria: {
            metric: 'cpa_ils',
            direction: 'decrease',
            thresholdPct: 25,
            minConv: 20,
        },
        source: 'rule_engine',
    })

    return out
}