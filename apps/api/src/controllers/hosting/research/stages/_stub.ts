/**
 * Phase 2 placeholder helper — every stage controller imports this until
 * Phase 3 replaces them with real implementations.
 *
 * Returns 501 with a stable message so the frontend pipeline widget can
 * surface a clear "(coming soon)" state per-stage during the transition,
 * instead of a generic 500.
 */

import type { Context } from 'hono'
import { fail } from '@/lib/response'
import type { StageId } from '@/services/research/types'

export function notImplementedYet(c: Context, stageId: StageId): Response {
    const titleMap: Record<StageId, string> = {
        competitor_landscape:   'נוף תחרותי',
        internal_seo_audit:     'אודיט SEO פנימי',
        seo_keyword_research:   'מחקר מילות מפתח (SEO)',
        aeo_visibility:         'נראות AI (AEO)',
        link_audit:             'אודיט פרופיל קישורים',
        paid_audit:             'אודיט פרסום ממומן',
        social_landscape:       'נוף רשתות חברתיות',
        email_competitor_audit: 'אודיט ניוזלטרים מתחרים',
        audience_personas:      'פרסונות קהל יעד',
        positioning:            'מיצוב',
        strategy_options:       'אופציות אסטרטגיה',
        validation:             'אימות אסטרטגיה',
        content_plan:           'תוכנית תוכן',
        media_plan:             'תוכנית מדיה',
    }
    return fail(
        c,
        `שלב "${titleMap[stageId]}" עדיין לא יושם (Phase 3 in docs/research-pipeline-design.md). השלב מתוכנן וזמין דרך runner; הלוגיקה תעבור לכאן בפיתוח הבא.`,
        501,
    )
}