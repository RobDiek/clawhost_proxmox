/**
 * Phase 4.3-S — Plain-language audit report.
 *
 * Converts AuditReport findings (technical, in English-ish jargon) into
 * Hebrew prose a non-engineer can act on. Each finding becomes a numbered
 * line in one of three sections: blockers (חוסמים), warnings (אזהרות),
 * notes (הערות).
 *
 * The translator uses finding.id + finding.scope to choose a friendly
 * template; unknown ids fall back to finding.title/detail directly.
 *
 * Output is Markdown. Used by:
 *   - agent_outputs.content for the auto-created "בדיקת איכות" task
 *   - GET /audit/onboarding/text endpoint
 *   - Slack/Telegram alert formatting
 */

import type { AuditReport, AuditFinding } from './types'

/** Per-finding human-readable line. Stored in the audit_findings agent_output. */
export interface PlainFinding {
    severity: 'fail' | 'warn' | 'info' | 'pass'
    /** Hebrew headline */
    headline: string
    /** Hebrew explanation in plain words — no jargon */
    explanation: string
    /** What the user should do (Hebrew, action-oriented) */
    action?: string
    /** Optional URL the finding is about */
    url?: string
    /** Technical id for tracking */
    technicalId: string
}

const FINDING_TEMPLATES: Record<string, (f: AuditFinding) => Omit<PlainFinding, 'severity' | 'technicalId'>> = {
    // ── Ground-truth: live site re-check vs stored audit claim
    false_missing_h1: (f) => ({
        headline: 'המערכת טעתה: דווח "חסרה כותרת H1" אבל הכותרת קיימת',
        explanation: `בדיקה חוזרת של ${f.scope?.url} מצאה שכותרת ראשית (H1) קיימת באתר, למרות שהאודיט סימן אותה כחסרה. הסיבה: רכיב בצינור הנתונים פספס אותה.`,
        action: 'הריצו את האודיט הפנימי מחדש (Re-run internal_seo_audit). אחרי התיקון הסימון יעלם.',
        url: f.scope?.url,
    }),
    false_missing_meta: (f) => ({
        headline: 'המערכת טעתה: דווח "חסר תיאור meta" אבל הוא קיים',
        explanation: `בדיקה חוזרת של ${f.scope?.url} מצאה meta description, למרות שהאודיט סימן אותו כחסר.`,
        action: 'הריצו את האודיט הפנימי מחדש.',
        url: f.scope?.url,
    }),
    dfs_misses_ldjson: (f) => ({
        headline: 'מערכת ה-DFS לא רואה schema מודרני (Yoast/RankMath)',
        explanation: `הדף ${f.scope?.url} מסומן ב-schema (LD-JSON), אבל ספק הנתונים שלנו (DataForSEO) מזהה רק schema ישן. האודיט סימן את הדף כ-"ללא schema" בטעות.`,
        action: 'תיקנו את זה ב-Phase 4.3-S — מעכשיו prefetch מוסיף בדיקת LD-JSON עצמאית. הריצו internal_seo_audit מחדש לקבל תוצאות נכונות.',
        url: f.scope?.url,
    }),
    word_count_drift: (f) => ({
        headline: 'הספירה של המילים בדף שונה מהפרסום האמיתי',
        explanation: `האודיט מדווח על מספר מילים שונה מהבדיקה החיה של ${f.scope?.url}. ההפרש נובע מכך ש-DFS סופר רק את הטקסט הנקי (ללא תפריטים, footer, JS) — זה התנהגות תקינה לרוב המקרים.`,
        action: 'אם פער קטן — תעלמו. אם פער גדול ועקבי — כדאי לוודא שהדף לא טוען תוכן רק דרך JavaScript (שאנחנו לא רואים).',
        url: f.scope?.url,
    }),

    // ── Cross-agent: data from one tenant leaking into another's records
    rd_sibling_leak: (f) => ({
        headline: 'נתוני המחקר מזכירים עסק אחר',
        explanation: `בנתוני המחקר של ${f.scope?.agentName} מופיעים אזכורים של עסק אחר שלכם. זה יכול להיות הזכר תחרות לגיטימי או שאריות מ-onboarding קודם.`,
        action: 'גלו לפרק המחקר ובדקו אם המתחרים שמופיעים שייכים לעסק הזה. אם זה עסק שלכם בטעות — הריצו "אסטרטגיה מחדש".',
    }),
    bb_sibling_leak: (f) => ({
        headline: 'ספר המותג מזכיר עסק אחר שלכם',
        explanation: `הספר Brand Book של ${f.scope?.agentName} מכיל אזכור לעסק אחר. סביר שהמערכת העתיקה אותו מהעסק הראשי שלכם בעת ההקמה.`,
        action: 'פתחו "מערכת מותג" → "התחילו מחדש" וצרו brand book נקי לעסק הזה.',
    }),
    ig_sibling_leak: (f) => ({
        headline: 'אינטגרציה מכילה זיהוי של עסק אחר',
        explanation: `אינטגרציה שמסומנת כשייכת ל-${f.scope?.agentName} מכילה מידע ייחודי לעסק אחר. אם זה חיבור משותף (כמו GSC שמחזיר את כל האתרים שלכם) — תקין. אם זו טעות חיבור — צריך לנתק ולחבר מחדש לסוכן הנכון.`,
        action: 'בדקו את האינטגרציה ב-לשונית "אינטגרציות". אם זו טעות — נתקו והתחברו מחדש.',
    }),
    gads_shared_op_cust: (f) => ({
        headline: 'אותו חשבון Google Ads משויך לעסקים שונים',
        explanation: `${f.scope?.agentName} משתמש באותו operating customer ID של עסק אחר ב-MCC שלכם. אם זה בכוונה (אותו חשבון מפרסם, קמפיינים שונים) — תקין. אם לא — נתוני קונברסיות וקמפיינים יזלגו ביניהם.`,
        action: 'בדקו ב-Google Ads UI שזה ה-sub-account הנכון לעסק הזה. אם לא — נתקו Google Ads מהסוכן הזה והתחברו מחדש עם הסוב-אקאונט הנכון.',
    }),
    gads_shared_mcc_info: () => ({
        headline: 'אותו חשבון Google Ads (MCC) משמש מספר עסקים שלכם',
        explanation: 'זה תקין כשהאקאונט אחד שלכם מנהל מספר עסקים. רק וודאו שהסוב-אקאונט והקמפיינים שונים לכל עסק.',
    }),

    // ── Pipeline health
    completed_no_result: (f) => ({
        headline: 'שלב מחקר סומן הושלם אבל אין תוצאה שמורה',
        explanation: `${f.scope?.stageId} מסומן completed אבל אין דאטה. ככל הנראה כתיבת תוצאה אחרת דרסה אותו.`,
        action: 'הריצו את השלב מחדש.',
    }),
    zombie_running: (f) => ({
        headline: 'שלב מחקר תקוע יותר משלושים דקות',
        explanation: `${f.scope?.stageId} סומן running מזמן ולא הסתיים. ככל הנראה התרסקות או חיבור רשת שנקטע.`,
        action: 'הריצו את השלב מחדש — הוא יחליף את המצב הקודם.',
    }),
    null_agent_id_outputs: () => ({
        headline: 'יש פלטים ישנים ללא שיוך לסוכן',
        explanation: 'מהזמן שלפני שהפרדנו סוכנים יש פלטים בלי agent_id. הם נראים רק לסוכן הראשי ב-VPS, לא לסוכן הזה.',
        action: 'אם זה חסר משהו ספציפי לסוכן הזה — אפשר לעדכן SQL לשייך אותם. בדרך כלל לא קריטי.',
    }),
    stale_conversion_drafts: () => ({
        headline: 'יש הצעת מיפוי פעולות המרה שמחכה לאישור יותר מיממה',
        explanation: 'הצעת מיפוי שזיהינו ל-Google Ads ConversionActions מחכה למישהו שיאשר אותה ב-משימות פעילות.',
        action: 'פתחו "משימות פעילות" ובחרו את ההצעה. עברו על הרשימה ואשרו רק את הפעולות שבאמת שייכות לעסק הזה.',
    }),

    // ── Integration coherence
    incoherent: (f) => ({
        headline: 'אינטגרציה מסומנת מחוברת אבל חסרים פרטים חיוניים',
        explanation: `אינטגרציה ${(f.evidence as { integrationType?: string })?.integrationType || '?'} סומנה כמחוברת אבל לא כל השדות הדרושים נשמרו. דברים שתלויים בה (פרסום, audit, וכו') יפלו בריצה.`,
        action: 'בדפי האינטגרציות — נתקו וחברו מחדש את האינטגרציה הזו.',
    }),
    missing_expected: () => ({
        headline: 'אינטגרציה חסרה פרטים אופציונליים',
        explanation: 'הפונקציונליות עובדת, רק שדות שעוזרים לדיאגנוסטיקה לא מלאים.',
    }),

    // ── Schema drift (currently passes — but template for future)
    path_always_empty: (f) => ({
        headline: 'שדה נתונים מצופה תמיד ריק',
        explanation: `מצינו ששדה ${(f.evidence as { path?: string })?.path || '?'} מ-${(f.evidence as { endpoint?: string })?.endpoint || '?'} ריק ב-100% מהדגימות. ככל הנראה ה-extractor שלנו קורא מהמקום הלא נכון.`,
        action: 'הנדסה: בדקו את ה-type definition והשוו לתגובה אמיתית של DFS.',
    }),

    // ── Defaults
    schema_drift_clean: () => ({
        headline: 'אין רחיפת סכמה בין צד הנתונים ל-extractors שלנו',
        explanation: 'בדקנו 12 endpoints של DataForSEO מול הדגימות בקאש — כל שדה שהקוד מצפה לו אכן קיים בתגובות אמיתיות.',
    }),
    cross_agent_clean: () => ({
        headline: 'אין דליפות בין הסוכן הזה לאחרים שלכם',
        explanation: 'בדקנו נתוני מחקר, אינטגרציות, brand book ו-Google Ads — אין סימני זליגה מסוכנים אחרים.',
    }),
    integration_coherent: () => ({
        headline: 'כל האינטגרציות תקינות',
        explanation: 'לכל חיבור פעיל יש את כל הפרטים הדרושים. דברים שתלויים בהן יעבדו.',
    }),
    ground_truth_clean: () => ({
        headline: 'כל ההודעות הקריטיות שדגמנו תואמות את האתר',
        explanation: 'בדקנו דגימה של דפים מ-internal_seo_audit מול האתר החי. כל מה שהאודיט אמר על הדפים האלה — נכון.',
    }),
    pipeline_healthy: () => ({
        headline: 'מצב הצינור (Pipeline) תקין',
        explanation: 'אין שלבים תקועים, אין סוכנים ללא הקצאה, אין תהליכים שלא הסתיימו.',
    }),
}

export function findingToPlain(f: AuditFinding): PlainFinding {
    // Try to match by stable ID prefix (e.g. "false_missing_h1:URL" → "false_missing_h1")
    const idKey = f.id.split(':')[0]
    const tmpl = FINDING_TEMPLATES[idKey]
    if (tmpl) {
        const out = tmpl(f)
        return { severity: f.severity, technicalId: f.id, ...out }
    }
    // Fallback — show technical title + detail (better than nothing)
    return {
        severity: f.severity,
        technicalId: f.id,
        headline: f.title,
        explanation: f.detail,
        action: f.fixHint,
        url: f.scope?.url,
    }
}

/**
 * Build the markdown body of the agent_output we create when audit finds
 * issues. Designed to be readable inside the משימות פעילות task expansion.
 */
export function buildPlainLanguageReport(report: AuditReport): string {
    const sections: { sev: 'fail' | 'warn' | 'info'; emoji: string; title: string; findings: AuditFinding[] }[] = [
        { sev: 'fail', emoji: '🛑', title: 'חוסמים — חייב לתקן לפני המשך', findings: [] },
        { sev: 'warn', emoji: '⚠', title: 'אזהרות — כדאי לבדוק', findings: [] },
        { sev: 'info', emoji: 'ℹ', title: 'הערות — לידיעה', findings: [] },
    ]
    for (const f of report.findings) {
        const bucket = sections.find(s => s.sev === f.severity)
        if (bucket) bucket.findings.push(f)
    }

    const lines: string[] = []
    const verdictHe = report.overall === 'ship_ready'
        ? '✅ מערכת מוכנה'
        : report.overall === 'has_issues'
            ? '⚠ יש מה לסקור'
            : '🛑 יש חוסמים'
    lines.push(`# בדיקת איכות אוטומטית — ${report.agentName}`)
    lines.push(`**מצב כללי**: ${verdictHe}`)
    lines.push(`**סיכום**: ${report.counts.fail} חוסמים · ${report.counts.warn} אזהרות · ${report.counts.info} הערות · ${report.counts.pass} בדיקות שעברו`)
    lines.push('')
    lines.push('---')

    for (const sec of sections) {
        if (sec.findings.length === 0) continue
        lines.push('')
        lines.push(`## ${sec.emoji} ${sec.title} (${sec.findings.length})`)
        let idx = 1
        for (const f of sec.findings) {
            const plain = findingToPlain(f)
            lines.push(`\n**${idx}. ${plain.headline}**`)
            lines.push(plain.explanation)
            if (plain.action) lines.push(`*מה לעשות*: ${plain.action}`)
            if (plain.url) lines.push(`*דף*: ${plain.url}`)
            idx++
        }
    }

    if (report.counts.fail === 0 && report.counts.warn === 0) {
        lines.push('')
        lines.push('## ✓ אין נושאים פתוחים')
        lines.push('כל הבדיקות שניסינו לבצע עברו בהצלחה.')
    }

    lines.push('')
    lines.push('---')
    lines.push(`*בדיקה הסתיימה ב-${new Date(report.ranAt).toLocaleString('he-IL')} · ${(report.durationMs / 1000).toFixed(1)} שניות.*`)
    return lines.join('\n')
}