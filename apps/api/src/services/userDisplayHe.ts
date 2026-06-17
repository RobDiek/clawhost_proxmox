/**
 * Systemic Hebrew display layer for user-facing agent_outputs.
 *
 * THE PROBLEM (recurring): producers emit structured content (English keys +
 * enum values + jargon) and forget to set `content.displayHe`, so the dashboard
 * fallback renderer dumps raw `weekNum: 1 / overallStatus: at_risk / onTrack: …`
 * — a mix of English and Hebrew the user should never see.
 *
 * THE FIX (once, for all output types): a server-side renderer that BACKFILLS a
 * clean Hebrew `displayHe` for any output whose content is a structured object
 * without one. Applied at the kabinet READ endpoint (outputs.ts) so it covers
 * every output type, reaches every tenant immediately (no dashboard Publish),
 * and is self-healing — producers no longer need to remember displayHe.
 *
 * Rule (Sergei): user-facing content is Hebrew; English is allowed ONLY for
 * abbreviations / product names (P0, GA4, GTM, KPI, ROAS, BigQuery, WhatsApp…).
 */

// Abbreviations + product/brand names kept verbatim (the only allowed English).
const KEEP_VERBATIM = new Set([
    // priorities / tiers
    'p0', 'p1', 'p2', 'p3',
    // analytics / ads / tracking acronyms
    'ga4', 'gtm', 'gsc', 'kpi', 'cpa', 'cpc', 'ctr', 'cpm', 'cpl', 'roas', 'roi', 'romi',
    'seo', 'aeo', 'sem', 'sea', 'serp', 'utm', 'gclid', 'lsa', 'cro', 'ugc', 'gbp', 'dpa',
    'pmax', 'rsa', 'ltv', 'cac', 'aov', 'sov', 'sql', 'mql', 'qa', 'vps', 'api', 'url',
    'ai', 'llm', 'b2b', 'b2c', 'cms', 'crm', 'cdp', 'cwv', 'inp', 'lcp', 'cls', 'h1', 'h2',
    'aio', 'sge', 'rtl', 'ltr', 'json', 'jsonld', 'html', 'css', 'cta', 'faq', 'nap', 'mcc',
    'tofu', 'mofu', 'bofu', 'usp', 'romi', 'ocid', 'gmb', 'pmax', 'dsa', 'gdn',
    // product / brand names
    'bigquery', 'whatsapp', 'github', 'wordpress', 'woocommerce', 'google', 'meta',
    'facebook', 'instagram', 'tiktok', 'youtube', 'linkedin', 'telegram', 'shopify',
    'anthropic', 'openai', 'claude', 'yoast', 'rankmath', 'elementor', 'wix', 'flowmatic',
    'analytics', 'ads', 'shopping', 'merchant', 'pixel', 'reels', 'wikidata',
])

// English structural keys → Hebrew labels.
const KEY_LABELS_HE: Record<string, string> = {
    weeknum: 'שבוע', weekofmonth: 'שבוע בחודש', week: 'שבוע', month: 'חודש',
    overallstatus: 'סטטוס כללי', status: 'סטטוס', statusreason: 'סיבת הסטטוס', reason: 'סיבה',
    ontrack: 'במסלול', behind: 'בפיגור', atrisk: 'בסיכון', offtrack: 'מחוץ למסלול', blocked: 'חסום',
    summary: 'תקציר', overview: 'סקירה', title: 'כותרת', description: 'תיאור', headline: 'כותרת',
    rationale: 'נימוק', recommendation: 'המלצה', recommendations: 'המלצות', nextsteps: 'צעדים הבאים',
    findings: 'ממצאים', issues: 'בעיות', warnings: 'אזהרות', blockers: 'חוסמים', risks: 'סיכונים',
    wins: 'הצלחות', highlights: 'דגשים', achievements: 'הישגים', alerts: 'התראות', notes: 'הערות',
    metric: 'מדד', metrics: 'מדדים', value: 'ערך', target: 'יעד', actual: 'בפועל', baseline: 'בסיס',
    channel: 'ערוץ', channels: 'ערוצים', priority: 'עדיפות', effort: 'מאמץ', impact: 'השפעה',
    expectedimpact: 'השפעה צפויה', estimatedeffort: 'מאמץ משוער', horizon: 'טווח זמן',
    confidence: 'רמת ביטחון', evidence: 'ראיה', source: 'מקור', sources: 'מקורות',
    actionplan: 'תוכנית פעולה', steps: 'צעדים', step: 'צעד', type: 'סוג', category: 'קטגוריה',
    generatedat: 'נוצר בתאריך', createdat: 'נוצר', updatedat: 'עודכן', date: 'תאריך', period: 'תקופה',
    goal: 'מטרה', goals: 'מטרות', objective: 'יעד', kpis: 'מדדי יעד', progress: 'התקדמות',
    budget: 'תקציב', spend: 'הוצאה', cost: 'עלות', revenue: 'הכנסה', leads: 'לידים',
    conversions: 'המרות', clicks: 'קליקים', impressions: 'חשיפות', traffic: 'תנועה',
    tasks: 'משימות', task: 'משימה', count: 'כמות', total: 'סך הכול', items: 'פריטים',
    name: 'שם', label: 'תווית', detail: 'פירוט', details: 'פירוט', message: 'הודעה', note: 'הערה',
    week_over_week: 'שבוע מול שבוע', month_over_month: 'חודש מול חודש',
    // weekly ops-brief / report schema keys (code contract = English keys; we
    // translate at DISPLAY time since the stored object must keep them in English).
    critical: 'קריטי', deviations: 'חריגות', deviation: 'חריגה', deviationpct: 'אחוז חריגה',
    severity: 'חומרה', topactions: 'פעולות מובילות', actions: 'פעולות', action: 'פעולה',
    owner: 'אחראי', deadline: 'מועד יעד',
    gatekeeperstatus: 'סטטוס שער', gatekeeper: 'שער', active: 'פעיל',
    organiccustomerstarget: 'יעד לקוחות אורגניים', organiccustomersactual: 'לקוחות אורגניים בפועל',
    costspendnote: 'הערת עלויות', nextreviewat: 'סקירה הבאה', nextreview: 'סקירה הבאה',
    customers: 'לקוחות', deviationspct: 'אחוז חריגה', durationms: 'משך (אלפיות שנייה)', ranat: 'הורץ בתאריך',
    delta: 'שינוי', trend: 'מגמה', forecast: 'תחזית', verdict: 'הכרעה', overall: 'כללי',
    competitors: 'מתחרים', persona: 'פרסונה', personas: 'פרסונות', offer: 'הצעה', offers: 'הצעות',
}

// English enum / scalar values → Hebrew.
const VALUE_HE: Record<string, string> = {
    at_risk: 'בסיכון', on_track: 'במסלול', behind: 'בפיגור', off_track: 'מחוץ למסלול',
    // no-underscore variants (weekly-report overallStatus uses these)
    atrisk: 'בסיכון', ontrack: 'במסלול', offtrack: 'מחוץ למסלול', onhold: 'בהמתנה',
    ahead: 'מקדים', blocked: 'חסום', critical: 'קריטי',
    high: 'גבוה', medium: 'בינוני', low: 'נמוך', none: 'אין',
    pending_review: 'ממתין לאישור', pending: 'ממתין', approved: 'אושר', rejected: 'נדחה',
    published: 'פורסם', draft: 'טיוטה', in_progress: 'בתהליך', completed: 'הושלם',
    failed: 'נכשל', proposed: 'מוצע', archived: 'בארכיון', skipped: 'דולג', done: 'בוצע',
    success: 'הצלחה', error: 'שגיאה', warning: 'אזהרה', ok: 'תקין', active: 'פעיל', inactive: 'לא פעיל',
    yes: 'כן', no: 'לא', true: 'כן', false: 'לא', unknown: 'לא ידוע', tbd: 'לקביעה',
    ship_ready: 'מוכן', has_issues: 'יש בעיות', not_ready: 'לא מוכן',
    ready: 'מוכן', activated: 'הופעל', founder: 'מייסד', stable: 'יציב', improving: 'משתפר', declining: 'יורד',
}

// Free-text English jargon → Hebrew (whole-word, case-insensitive). Abbreviations
// and product names are protected by KEEP_VERBATIM and never touched.
const JARGON_HE: Record<string, string> = {
    outputs: 'פלטים', output: 'פלט', capability: 'יכולת', capabilities: 'יכולות',
    tracking: 'מעקב', measurement: 'מדידה', attribution: 'ייחוס', funnel: 'משפך',
    scaling: 'הגדלה', launch: 'השקה', authority: 'סמכות', awareness: 'מודעות',
    retargeting: 'פנייה חוזרת', remarketing: 'פנייה חוזרת', audience: 'קהל יעד',
    bidding: 'הצעות מחיר', keyword: 'מילת מפתח', keywords: 'מילות מפתח', campaign: 'קמפיין',
    campaigns: 'קמפיינים', creative: 'קריאייטיב', landing: 'נחיתה', schema: 'תיוג מובנה',
    review: 'סקירה', reviews: 'ביקורות', conversion: 'המרה', backlink: 'קישור נכנס',
    backlinks: 'קישורים נכנסים', publish: 'פרסום', draft: 'טיוטה', baseline: 'בסיס',
    benchmark: 'מדד ייחוס', insight: 'תובנה', insights: 'תובנות', performance: 'ביצועים',
    optimization: 'אופטימיזציה', engagement: 'מעורבות', reach: 'חשיפה', placement: 'מיקום',
    snippet: 'קטע קוד', integration: 'אינטגרציה', dashboard: 'לוח בקרה', report: 'דוח',
    pending: 'ממתין', approved: 'אושר', recommended: 'מומלץ', deferred: 'נדחה למועד מאוחר',
    // common free-text jargon seen in ops briefs / reports
    tokens: 'טוקנים', token: 'טוקן', tools: 'כלים', paid: 'ממומן', pipeline: 'תהליך',
    tasks: 'משימות', task: 'משימה',
    generation: 'הפקה', cap: 'תקרה', provider: 'ספק', outreach: 'פנייה יזומה', founder: 'מייסד',
    contract: 'חוזה', proposal: 'הצעה', signed: 'נחתם', accepted: 'התקבל', blocked: 'חסום',
    data: 'נתונים', driven: 'מונחה', spend: 'הוצאה', budget: 'תקציב', organic: 'אורגני',
    gatekeeper: 'שער', deviation: 'חריגה', severity: 'חומרה', target: 'יעד', actual: 'בפועל',
    feedback: 'משוב', loop: 'לולאה', fix: 'תיקון', gap: 'פער', bottleneck: 'צוואר בקבוק',
    upsell: 'מכירה נוספת', churn: 'נטישה', retention: 'שימור', onboarding: 'הצטרפות',
    // domain terms that leak into monthly-task summaries / source excerpts
    entity: 'ישות', disambiguation: 'הבחנה', extractability: 'יכולת חילוץ',
    grade: 'דרגה', score: 'ציון', signals: 'סיגנלים', signal: 'סיגנל', lift: 'שיפור',
    anchor: 'עוגן', citation: 'ציטוט', citations: 'ציטוטים', quotability: 'ציטוטיות',
    network: 'רשת', foundation: 'בסיס', boost: 'הגברה', visibility: 'נראות',
    competitor: 'מתחרה', competitors: 'מתחרים', advantage: 'יתרון', lesson: 'לקח',
    immediate: 'מיידי', expected: 'צפוי', priority: 'עדיפות', brand: 'מותג',
    apply: 'ליישם', plan: 'תוכנית', state: 'מצב', current: 'נוכחי', strong: 'חזק',
    missing: 'חסר', present: 'קיים', high: 'גבוה', medium: 'בינוני', low: 'נמוך',
    pages: 'דפים', page: 'דף', with: 'עם', without: 'ללא', strength: 'חוזק',
    software: 'תוכנה', country: 'מדינה', official: 'רשמי', properties: 'מאפיינים',
    validator: 'מאמת', merge: 'מיזוג', deploy: 'פריסה', threshold: 'סף', kill: 'עצירה',
    // common SEO / ops words that leak into report + task text (seen in plans)
    audit: 'אודיט', refresh: 'רענון', decision: 'החלטה', thin: 'דליל', duplicate: 'כפול',
    canonical: 'קנוני', redirect: 'הפניה', sitemap: 'מפת אתר', crawl: 'סריקה', render: 'רינדור',
    expand: 'הרחבה', expansion: 'הרחבה', homepage: 'דף הבית', commercial: 'מסחרי', meta: 'מטא',
    description: 'תיאור', headline: 'כותרת', refreshed: 'רוענן', indexing: 'אינדוקס',
    duplication: 'כפילות', internal: 'פנימי', external: 'חיצוני', inbound: 'נכנס', outbound: 'יוצא',
    title: 'כותרת', heading: 'כותרת', body: 'גוף', word: 'מילה', words: 'מילים', count: 'כמות',
    quality: 'איכות', technical: 'טכני', structured: 'מובנה', markup: 'תיוג', cluster: 'אשכול',
    // Google-Ads / ops workflow words that recur in action-plan steps
    automated: 'אוטומטי', automation: 'אוטומציה', rule: 'כלל', rules: 'כללים', pause: 'השהיה',
    paused: 'מושהה', search: 'חיפוש', settings: 'הגדרות', action: 'פעולה', actions: 'פעולות',
    condition: 'תנאי', conditions: 'תנאים', cost: 'עלות', type: 'סוג', group: 'קבוצה', groups: 'קבוצות',
    total: 'סך הכול', first: 'ראשון', conservative: 'שמרני', extrapolated: 'מוערך', rolling: 'מתגלגל',
    days: 'ימים', day: 'יום', smart: 'חכם', bulk: 'בכמות', form: 'טופס', submit: 'שליחה',
    negatives: 'מילות שלילה', negative: 'שלילי', brands: 'מותגים', terms: 'מונחים', term: 'מונח',
    match: 'התאמה', phrase: 'ביטוי', exact: 'מדויק', broad: 'רחב', sheet: 'גיליון', weekly: 'שבועי',
    monthly: 'חודשי', daily: 'יומי', records: 'רשומות', record: 'רשומה', queries: 'שאילתות',
    query: 'שאילתה', tab: 'לשונית', column: 'עמודה', row: 'שורה', filter: 'מסנן', sort: 'מיון',
    account: 'חשבון', client: 'לקוח', adhoc: 'אד-הוק', verdict: 'הכרעה',
    // round-2 residuals (free-text words surfaced by the residual detector)
    strategy: 'אסטרטגיה', clicks: 'קליקים', click: 'קליק', conv: 'המרות', email: 'אימייל',
    send: 'שליחה', frequency: 'תדירות', preview: 'תצוגה מקדימה', positives: 'חיוביות', exempt: 'פטור',
    defense: 'הגנה', enhanced: 'משופר', lists: 'רשימות', list: 'רשימה', login: 'התחברות',
    download: 'הורדה', shared: 'משותף', library: 'ספרייה', research: 'מחקר', language: 'שפה',
    share: 'שיתוף', locations: 'מיקומים', location: 'מיקום', enter: 'הזנה', another: 'נוסף',
    level: 'רמה', jobs: 'עבודות', secondhand: 'יד שנייה', free: 'חינם', impressions: 'חשיפות',
    types: 'סוגים', imported: 'מיובא', objective: 'יעד', transition: 'מעבר', presence: 'נוכחות',
    alternative: 'חלופה', multi: 'רב', defensive: 'הגנתי', branded: 'ממותג', generic: 'גנרי',
}

// Internal source-ref prefixes (data pointers the LLM cites) → human Hebrew label.
// These are NOT user vocabulary — strip the technical path, keep a readable origin.
const SOURCE_REF_HE: Array<[RegExp, string]> = [
    [/^aeo_audit|aeo_visibility/i, 'בדיקת נראות ב-AI (AEO)'],
    [/^internal_seo_audit/i, 'בדיקת SEO פנימית באתר'],
    [/^seo_keyword_research|dfs\.keywords/i, 'מחקר מילות מפתח'],
    [/^paid_keyword_research/i, 'מחקר מילות מפתח לפרסום'],
    [/^paid_competitor_landscape|transparency\.competitor/i, 'ניתוח מתחרים בפרסום'],
    [/^competitor_landscape|competitor_aeo/i, 'ניתוח מתחרים'],
    [/^link_audit/i, 'בדיקת קישורים'],
    [/^audit\.recommendedActions|mazhirAudit|^audit\./i, 'המלצות מבדיקת החשבון'],
    [/^seo_research/i, 'מחקר SEO'],
    [/^audience_personas|strategy\.persona/i, 'פרסונות קהל היעד'],
    [/^positioning|strategy\.positioning/i, 'מיצוב'],
    [/^chosenScenario|cost_timeline/i, 'התרחיש והתקציב שנבחרו'],
    [/^archetypeStrategy/i, 'אסטרטגיית הארכיטיפ'],
    [/^client_account_baseline|baseline/i, 'נתוני הבסיס של החשבון'],
    [/^ga4\.|gsc\.|^integrations\./i, 'נתוני מדידה'],
]

/** Humanize an internal source-ref pointer to a readable Hebrew origin label. */
export function humanizeSourceRef(ref: string): string {
    if (!ref) return ref
    for (const [re, he] of SOURCE_REF_HE) if (re.test(ref)) return he
    // Unknown → strip the technical path/brackets and translate residual jargon.
    const head = ref.replace(/\[.*$/, '').replace(/[._]/g, ' ').trim()
    return humanizeStringHe(head) || ref
}

interface CleanableTask {
    title?: string
    summary?: string
    expectedImpact?: { rationale?: string } | null
    actionPlan?: Array<{ step?: string } | null> | null
    sources?: Array<{ ref?: string; excerpt?: string } | null> | null
}

/**
 * Deterministically clean a monthly-task's USER-FACING text to Hebrew (English
 * only for abbreviations / product names). The kabinet task popup reads these
 * fields straight from research_data.monthlyPlan.tasks — bypassing the displayHe
 * humanizer — so this pass is what keeps that card readable. Mutates in place.
 */
export function cleanTaskForUser<T extends CleanableTask>(task: T): T {
    if (task.title) task.title = humanizeStringHe(task.title)
    if (task.summary) task.summary = humanizeStringHe(task.summary)
    if (task.expectedImpact && task.expectedImpact.rationale) {
        task.expectedImpact.rationale = humanizeStringHe(task.expectedImpact.rationale)
    }
    if (Array.isArray(task.actionPlan)) {
        for (const s of task.actionPlan) if (s && s.step) s.step = humanizeStringHe(s.step)
    }
    if (Array.isArray(task.sources)) {
        for (const src of task.sources) {
            if (!src) continue
            if (src.excerpt) src.excerpt = humanizeStringHe(src.excerpt)
            if (src.ref) src.ref = humanizeSourceRef(src.ref)
        }
    }
    return task
}

/** Clean every task in a plan (in place). Returns the count cleaned. */
export function cleanPlanTasksForUser(tasks: CleanableTask[]): number {
    if (!Array.isArray(tasks)) return 0
    let n = 0
    for (const t of tasks) { if (t) { cleanTaskForUser(t); n++ } }
    return n
}

const ABBR_RE = /^[A-Z0-9]{2,6}$/   // ALL-CAPS short token = abbreviation → keep

function isAbbreviation(token: string): boolean {
    const lower = token.toLowerCase().replace(/[^a-z0-9]/g, '')
    return KEEP_VERBATIM.has(lower) || ABBR_RE.test(token)
}

function translateToken(word: string): string {
    if (isAbbreviation(word)) return word
    const lower = word.toLowerCase()
    if (VALUE_HE[lower]) return VALUE_HE[lower]
    if (JARGON_HE[lower]) return JARGON_HE[lower]
    return word   // unknown English word: leave as-is (rare; can't translate arbitrarily)
}

/** Translate the common English jargon tokens inside a free-text string,
 *  keeping abbreviations + product names verbatim. snake_case identifiers that
 *  the LLM occasionally dumps into excerpts (e.g. `expected_aio_lift`) are split
 *  and translated part-by-part so no raw English identifier survives. */
export function humanizeStringHe(input: string): string {
    if (!input) return input
    return input.replace(/[A-Za-z][A-Za-z0-9_]*/g, (word) => {
        if (word.indexOf('_') !== -1) {
            // snake_case identifier → translate each part (keep abbreviations).
            return word.split('_').filter(Boolean).map(translateToken).join(' ')
        }
        return translateToken(word)
    })
}

function labelFor(key: string): string {
    const norm = key.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (KEY_LABELS_HE[norm]) return KEY_LABELS_HE[norm]
    // snake/camel → spaced, then jargon-translate as a fallback label.
    const spaced = key.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
    return humanizeStringHe(spaced)
}

function valueToHe(v: unknown): string {
    if (v === null || v === undefined || v === '') return '—'
    if (typeof v === 'boolean') return v ? 'כן' : 'לא'
    if (typeof v === 'number') return String(v)
    const s = String(v).trim()
    const enumHit = VALUE_HE[s.toLowerCase()]
    if (enumHit && /^[a-z_ ]+$/i.test(s)) return enumHit
    return humanizeStringHe(s)
}

const SKIP_KEYS = new Set(['displayhe', 'id', '_id', 'outputid', 'instanceid', 'agentid', 'taskid'])

/** Render a structured content object as clean Hebrew markdown. Recursive,
 *  depth/length-capped. Used to backfill displayHe. */
export function buildDisplayHe(obj: unknown, depth = 0): string {
    if (obj === null || obj === undefined) return ''
    if (typeof obj !== 'object') return valueToHe(obj)

    const indent = depth > 0 ? '  '.repeat(depth) : ''

    if (Array.isArray(obj)) {
        return obj.slice(0, 30).map(item => {
            if (item && typeof item === 'object') {
                const inner = buildDisplayHe(item, depth + 1)
                return `${indent}- ${inner.replace(/^\s+/, '')}`
            }
            return `${indent}- ${valueToHe(item)}`
        }).join('\n')
    }

    const lines: string[] = []
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
        if (SKIP_KEYS.has(key.toLowerCase())) continue
        if (val === null || val === undefined || val === '') continue
        const label = labelFor(key)
        if (Array.isArray(val)) {
            if (val.length === 0) continue
            lines.push(`**${label}:**`)
            lines.push(buildDisplayHe(val, depth + 1))
        } else if (typeof val === 'object') {
            lines.push(`**${label}:**`)
            lines.push(buildDisplayHe(val, depth + 1))
        } else {
            lines.push(`**${label}:** ${valueToHe(val)}`)
        }
    }
    return lines.join('\n')
}

/**
 * Ensure a kabinet output row carries a clean Hebrew `displayHe`. If `content`
 * is a structured JSON object WITHOUT displayHe, inject one (built server-side).
 * Plain-text content and content that already has displayHe pass through
 * untouched. Returns a shallow clone; never throws (best-effort per row).
 */
export function ensureDisplayHeOnRow<T extends { content?: unknown }>(row: T): T {
    try {
        const content = (row as any).content
        if (typeof content !== 'string') return row
        const s = content.trim()
        if (!(s.charAt(0) === '{' || s.charAt(0) === '[')) return row   // plain text — leave it
        let obj: any
        try { obj = JSON.parse(s) } catch { return row }                 // unparseable — leave for the dashboard's raw extractor
        if (obj && typeof obj === 'object' && !Array.isArray(obj) && obj.displayHe) return row
        const displayHe = buildDisplayHe(obj)
        if (!displayHe.trim()) return row
        const next = Array.isArray(obj) ? { displayHe, items: obj } : { displayHe, ...obj }
        return { ...row, content: JSON.stringify(next) }
    } catch {
        return row
    }
}