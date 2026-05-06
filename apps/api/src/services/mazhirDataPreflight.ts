/**
 * Pre-flight Data Coverage Checklist.
 *
 * Runs BEFORE the user clicks "הריצו אודיט" — surfaces every data source
 * that's missing along with a plain-Hebrew "what you lose without this"
 * explanation. Lets the user decide: connect more, or proceed with gaps.
 *
 * Differs from mazhirPreflight.ts: that one blocks LAUNCH; this one
 * advises BEFORE the AUDIT, so the audit isn't run on starvation data.
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'

export interface DataPreflightItem {
    id: string
    label: string
    status: 'ok' | 'missing' | 'partial' | 'n/a'
    importance: 'critical' | 'recommended' | 'optional'
    whatWeLose: string                  // plain Hebrew
    howToFix?: string                   // plain Hebrew action
}

export interface DataPreflightResult {
    instanceId: string
    overallReady: 'green' | 'yellow' | 'red'
    items: DataPreflightItem[]
}

export async function runDataPreflight(instanceId: string): Promise<DataPreflightResult> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error('Instance not found')

    const rd: any = inst.researchData || {}
    const pp: any = rd.paidProfile
    const tokens: any = inst.googleTokens || {}
    const adsConfig: any = inst.googleAdsConfig || {}
    const callCfg: any = (inst as any).callTrackingConfig
    const scopes = (tokens.scopes || []).map((s: string) => s.toLowerCase())

    const items: DataPreflightItem[] = []

    // 1. Paid profile filled
    items.push({
        id: 'paid_profile',
        label: 'פרופיל קידום ממומן',
        status: pp ? 'ok' : 'missing',
        importance: 'critical',
        whatWeLose: 'בלי הפרופיל הסוכן לא יודע תקציב, מטרה, או מי קהל היעד — לא ניתן להריץ אודיט.',
        howToFix: 'מלאו את פרופיל הקידום הממומן בכרטיסיית "ניהול שיווק"',
    })

    // 2. Historical performance fields
    const hasHistoricalNumbers = pp && (pp.historicalCpcIls != null || pp.historicalConversionRatePct != null)
    items.push({
        id: 'historical_performance',
        label: 'נתונים היסטוריים (CPC, אחוז המרה)',
        status: hasHistoricalNumbers ? 'ok' : 'missing',
        importance: 'recommended',
        whatWeLose: 'בלי המספרים האמיתיים שלכם, הסוכן יחשב tCPA מנוסחאות תיאורטיות במקום מהביצועים שלכם — סיכון להפסד תקציב.',
        howToFix: 'מלאו "נתונים היסטוריים" בפרופיל אם רצתם קמפיין בעבר',
    })

    // 3. Historical CSV reports
    const hasReports = pp?.historicalReports?.length > 0
    items.push({
        id: 'historical_reports',
        label: 'דוחות CSV מקמפיינים קודמים',
        status: hasReports ? 'ok' : 'missing',
        importance: 'recommended',
        whatWeLose: 'בלי דוחות, ניתוח n-gram waste מתבסס על השערה ולא על נתונים אמיתיים.',
        howToFix: 'הורידו CSV מ-Google Ads → Reports → Search Terms / Campaigns ב-90 ימים האחרונים והעלו לפרופיל',
    })

    // 4. Google Ads OAuth + customerId
    const hasAdsScope = scopes.some((s: string) => s.includes('adwords') || s.includes('ads'))
    const hasAdsCustomer = !!adsConfig.customerId
    const hasDevToken = !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN
    const adsStatus = (hasAdsScope && hasAdsCustomer && hasDevToken) ? 'ok' :
                     (hasAdsScope || hasAdsCustomer) ? 'partial' : 'missing'
    items.push({
        id: 'google_ads_account',
        label: 'חשבון Google Ads מחובר',
        status: pp?.hasExistingAccount ? adsStatus : 'n/a',
        importance: 'recommended',
        whatWeLose: 'בלי חיבור — לא ניתן להריץ Search Terms Report, Auction Insights, או Change History. Mazhir יסתמך על השערות תעשייתיות.',
        howToFix: 'התחברו ל-Google והעניקו הרשאות Google Ads בכרטיסיית הגדרות',
    })

    // 5. GA4 connected
    const hasAnalyticsScope = scopes.some((s: string) => s === 'analytics' || s.includes('analytics'))
    items.push({
        id: 'ga4',
        label: 'Google Analytics 4',
        status: hasAnalyticsScope ? 'ok' : 'missing',
        importance: 'critical',
        whatWeLose: 'בלי GA4 — אנחנו לא יודעים את אחוזי ההמרה האמיתיים שלכם, פילוח קהלים, מקור התנועה. Mazhir פועל בעיוורון.',
        howToFix: 'התחברו ל-Google עם הרשאת analytics',
    })

    // 6. GTM connected
    const hasTagManagerScope = scopes.some((s: string) => s.includes('tagmanager'))
    items.push({
        id: 'gtm',
        label: 'Google Tag Manager',
        status: hasTagManagerScope ? 'ok' : 'missing',
        importance: 'critical',
        whatWeLose: 'בלי GTM — לא ניתן להתקין פיקסל המרה של Google Ads אוטומטית. צריך להוסיף ידנית כל תג.',
        howToFix: 'התחברו ל-Google עם הרשאת tagmanager',
    })

    // 7. Search Console
    const hasSearchConsoleScope = scopes.some((s: string) => s.includes('webmasters') || s.includes('search-console'))
    items.push({
        id: 'search_console',
        label: 'Google Search Console',
        status: hasSearchConsoleScope ? 'ok' : 'missing',
        importance: 'optional',
        whatWeLose: 'בלי Search Console — לא נדע באילו מילים אתם מדורגים אורגנית, מה יוצר קניבליזציה עם paid, או מילים לא-בלתי-ניצלות לתוספת bid.',
        howToFix: 'התחברו ל-Google עם הרשאת webmasters',
    })

    // 8. Call tracking
    const callStatus = callCfg?.provider && callCfg?.apiKey ? 'ok' :
                      pp?.trackingStack?.callTracking === 'none' ? (pp?.trackingStack?.phoneCallsRelevant ? 'missing' : 'n/a') : 'partial'
    items.push({
        id: 'call_tracking',
        label: 'מעקב שיחות (CallRail / WhatConverts)',
        status: callStatus as any,
        importance: pp?.trackingStack?.phoneCallsRelevant ? 'critical' : 'optional',
        whatWeLose: 'בלי מעקב שיחות — לא נדע אילו מודעות יצרו לידים אמיתיים בטלפון, וגוגל לא יוכל לבצע אופטימיזציה לפי שיחות איכותיות.',
        howToFix: 'הוסיפו provider בהגדרות (אם שיחות רלוונטיות)',
    })

    // 9. Website URL
    items.push({
        id: 'website_url',
        label: 'כתובת אתר',
        status: rd.answers?.websiteUrl ? 'ok' : 'missing',
        importance: 'critical',
        whatWeLose: 'בלי URL — אי אפשר להריץ PageSpeed (Quality Score) או לקבוע URL סופי לקמפיינים.',
        howToFix: 'הוסיפו אתר במחקר ראשוני',
    })

    // 10. Competitors
    items.push({
        id: 'competitors',
        label: 'מתחרים מזוהים',
        status: rd.answers?.competitors?.length > 5 ? 'ok' : 'partial',
        importance: 'recommended',
        whatWeLose: 'בלי דומיינים של מתחרים — אנחנו לא יכולים לסרוק את היצירות שלהם ב-Google Ads Transparency Center.',
        howToFix: 'הוסיפו מתחרים במחקר השוק',
    })

    // 11. DataForSEO key
    items.push({
        id: 'dataforseo',
        label: 'DataForSEO API (מילות מפתח)',
        status: (inst as any).dataforseoKey ? 'ok' : 'missing',
        importance: 'recommended',
        whatWeLose: 'בלי DFS — נפח ו-CPC של מילות מפתח יהיו ניחוש ולא נתון אמיתי לישראל.',
        howToFix: 'הוסיפו מפתח API בהגדרות מערכת (פלטפורמה)',
    })

    // Compute overall
    const criticals = items.filter(i => i.importance === 'critical' && (i.status === 'missing' || i.status === 'partial'))
    const recommended = items.filter(i => i.importance === 'recommended' && i.status === 'missing')
    const overallReady: 'green' | 'yellow' | 'red' = criticals.length > 0 ? 'red' : recommended.length > 2 ? 'yellow' : 'green'

    return { instanceId, overallReady, items }
}