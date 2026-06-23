/**
 * Report schedules — single source of truth for the THREE user-facing
 * scheduled reports the dashboard "שגרות מתוזמנות" panel exposes:
 *   - daily_brief        (core)  → cron "daily-brief"        (menateach)
 *   - weekly_competitive (core)  → cron "weekly-competitive" (sayer)
 *   - aeo_deep_audit     (seo)   → cron "aeo-audit"          (migdalor)
 *
 * Why this module exists:
 *   The dashboard lets the user pick hour + days and save. Until now that
 *   save was a no-op (TODO) — the openclaw crons were created once at
 *   onboarding with FIXED times and never re-issued. This module makes the
 *   save real: it rebuilds the cron expression from the user's choice and
 *   re-issues the openclaw cron on the VPS (delete-by-name + add).
 *
 *   It is also the single place the report MESSAGES live, so onboarding
 *   (activateAgentCrons) and edit (saveSchedules) stay consistent — and so
 *   the report structure (goal-vs-actual + color status + 3 recommended
 *   actions with owner + due date) is requested uniformly.
 */

export type ScheduleType = 'daily' | 'weekly' | 'monthly'

export interface ReportScheduleCfg {
    enabled?: boolean
    time?: string          // "HH:MM" Israel time
    days?: number[]        // 0=Sun..6=Sat (daily)
    weekday?: number       // 0..6 (weekly)
    monthday?: number      // 1..28 (monthly)
}

export interface ReportCronDef {
    scheduleKey: string
    bundleId: 'core' | 'seo'
    cronName: string
    description: string
    model: 'haiku' | 'sonnet' | 'opus'
    scheduleType: ScheduleType
    message: string
    default: ReportScheduleCfg
}

/**
 * Structured messages — every performance report is asked for in the same
 * shape the lesson promises: יעד מול בפועל with 🟢/🟡/🔴 status, ending in
 * exactly 3 recommended actions, each with an owner (אחראי) + due date.
 */
export const REPORT_CRONS: ReportCronDef[] = [
    {
        scheduleKey: 'daily_brief',
        bundleId: 'core',
        cronName: 'daily-brief',
        description: 'סיכום יומי',
        model: 'haiku',
        scheduleType: 'daily',
        default: { enabled: true, time: '07:00', days: [0, 1, 2, 3, 4] },
        message:
            'הכינו Daily Brief בעברית (לשון רבים), קצר ותכליתי לטלגרם. מבנה: ' +
            '1) סיכום אתמול — מה בוצע. ' +
            '2) ממתין לאישור. ' +
            '3) 3 פעולות מומלצות להיום — לכל אחת אחראי ותאריך יעד. ' +
            '4) חדשות רלוונטיות לתחום אם יש.',
    },
    {
        scheduleKey: 'weekly_competitive',
        bundleId: 'core',
        cronName: 'weekly-competitive',
        description: 'דוח תחרותי שבועי',
        model: 'sonnet',
        scheduleType: 'weekly',
        default: { enabled: true, time: '08:00', weekday: 1 },
        message:
            'הכינו דוח תחרותי שבועי בעברית (לשון רבים) לטלגרם. מבנה: ' +
            '1) מה המתחרים עשו השבוע — שינויי מחיר, פיצ\'רים, קמפיינים. ' +
            '2) הזדמנויות תוכן מדורגות 1-10. ' +
            '3) יעד מול בפועל היכן שיש נתון (תנועה/לידים) עם מצב: 🟢 על המסלול / 🟡 פיגור / 🔴 קריטי. ' +
            '4) בסוף — בדיוק 3 פעולות מומלצות לשבוע הקרוב, לכל אחת אחראי ותאריך יעד.',
    },
    {
        scheduleKey: 'aeo_deep_audit',
        bundleId: 'seo',
        cronName: 'aeo-audit',
        description: 'ביקורת AEO חודשית',
        model: 'sonnet',
        scheduleType: 'monthly',
        default: { enabled: true, time: '10:00', monthday: 1 },
        message:
            'בצעו ביקורת AEO חודשית בעברית (לשון רבים). בדקו אזכורים של העסק ב-ChatGPT, Claude, Perplexity, Gemini. מבנה: ' +
            '1) ציון AEO 1-100 + השוואה לחודש הקודם. ' +
            '2) יעד מול בפועל לכל מנוע עם מצב 🟢/🟡/🔴. ' +
            '3) entity consensus — האם ה-AI מדייק עלינו. ' +
            '4) בסוף — בדיוק 3 פעולות מומלצות לחודש הקרוב, לכל אחת אחראי ותאריך יעד.',
    },
]

/** Parse "HH:MM" → { hour, minute } with safe fallback. */
function parseTime(time?: string): { hour: number; minute: number } {
    const m = /^(\d{1,2}):(\d{2})$/.exec((time || '').trim())
    if (!m) return { hour: 7, minute: 0 }
    const hour = Math.min(23, Math.max(0, parseInt(m[1], 10)))
    const minute = Math.min(59, Math.max(0, parseInt(m[2], 10)))
    return { hour, minute }
}

/**
 * Build a 5-field cron expression from the user's schedule choice.
 * Returns null if the schedule is malformed (caller skips re-issue).
 */
export function buildReportCronExpr(type: ScheduleType, cfg: ReportScheduleCfg): string | null {
    const { hour, minute } = parseTime(cfg.time)
    if (type === 'daily') {
        const days = Array.isArray(cfg.days) && cfg.days.length > 0
            ? [...new Set(cfg.days.filter(d => d >= 0 && d <= 6))].sort((a, b) => a - b)
            : [0, 1, 2, 3, 4]
        if (days.length === 0) return null
        return `${minute} ${hour} * * ${days.join(',')}`
    }
    if (type === 'weekly') {
        const wd = (typeof cfg.weekday === 'number' && cfg.weekday >= 0 && cfg.weekday <= 6) ? cfg.weekday : 1
        return `${minute} ${hour} * * ${wd}`
    }
    // monthly
    const md = (typeof cfg.monthday === 'number' && cfg.monthday >= 1 && cfg.monthday <= 28) ? cfg.monthday : 1
    return `${minute} ${hour} ${md} * *`
}

/**
 * Re-issue the openclaw crons for the three report schedules on a tenant's
 * VPS, reflecting the user's saved hour/days. Best-effort + idempotent:
 * each report is delete-by-name then re-added (so timing edits take effect);
 * an explicitly disabled report is deleted and not re-added.
 *
 * @param exec  runs a shell command on the VPS (as root) and returns stdout
 * @param allSchedules  the agent's full schedules object: { core:{...}, seo:{...} }
 * @returns names applied / removed
 */
export async function applyReportSchedules(
    exec: (command: string) => Promise<string>,
    allSchedules: Record<string, unknown>,
): Promise<{ applied: string[]; removed: string[] }> {
    const applied: string[] = []
    const removed: string[] = []
    const touchedNames: string[] = []   // every name we re-issue → purge first
    const addBlocks: string[] = []

    for (const def of REPORT_CRONS) {
        const bundle = (allSchedules?.[def.bundleId] as Record<string, ReportScheduleCfg> | undefined) || {}
        const cfg = bundle[def.scheduleKey]
        if (!cfg) continue // not configured this save → leave as-is
        touchedNames.push(def.cronName)

        if (cfg.enabled === false) { removed.push(def.cronName); continue }

        const expr = buildReportCronExpr(def.scheduleType, cfg)
        if (!expr) { removed.push(def.cronName); continue }

        // Hebrew message via heredoc env var (safe for quotes/specials).
        const tag = `MSG_${def.cronName.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`
        addBlocks.push(
            `${tag}=$(cat <<'CLAWEOF_${def.cronName}'\n${def.message}\nCLAWEOF_${def.cronName}\n)`,
            `openclaw cron add --name "${def.cronName}" --description "${def.description}" --cron "${expr}" --tz "Asia/Jerusalem" --model "${def.model}" --message "$${tag}" --session isolated 2>&1 | head -2`,
        )
        applied.push(`${def.cronName}:${expr}`)
    }

    if (touchedNames.length === 0) return { applied, removed }

    // `openclaw cron delete --name` is unreliable (leaves duplicates); remove by
    // ID instead. List once, take the IDs whose name we're re-issuing, remove
    // each, THEN add — so an edit REPLACES (never duplicates) the cron, and any
    // duplicates from earlier buggy runs get cleaned up too.
    const namesArg = touchedNames.join(' ')
    const purge =
        `IDS=$(openclaw cron list --json 2>/dev/null | python3 -c "import sys,json; ` +
        `d=json.load(sys.stdin); items=d.get('jobs', d if isinstance(d,list) else []); ` +
        `names=set('${namesArg}'.split()); ` +
        `print(' '.join(x.get('id','') for x in items if x.get('name') in names))" 2>/dev/null)\n` +
        `for cid in $IDS; do openclaw cron rm "$cid" 2>/dev/null; done`

    const script = ['#!/bin/bash', 'set +e', purge, ...addBlocks].join('\n')
    const b64 = Buffer.from(script).toString('base64')
    // Run as the openclaw user (crons live in its home).
    await exec(`echo '${b64}' | base64 -d > /tmp/_report_sched.sh && chmod +x /tmp/_report_sched.sh && chown openclaw:openclaw /tmp/_report_sched.sh && su - openclaw -c 'bash /tmp/_report_sched.sh' 2>&1 | tail -8; rm -f /tmp/_report_sched.sh`)
    return { applied, removed }
}