/**
 * Deterministic monthly-plan scheduler.
 *
 * Problem it fixes: the LLM passes assigned scheduledFor inconsistently and the
 * structured fillers left it empty — so the kabinet calendar (which bins by
 * scheduledFor) showed ~1 task/week while 75 tasks sat undated.
 *
 * Rule (Sergei): tasks must start on DAY 1, ≥5 per business day, and the
 * FOUNDATIONAL / technical work — analytics (GA4), GTM, conversion setup,
 * pixels, and on-site SEO/AEO fixes — must be FRONT-LOADED and packed densely,
 * because agents execute those instantly given live integrations. Only after the
 * foundation is scheduled do the build/ongoing tasks fill the following days.
 *
 * Deterministic, dependency-aware, every task gets a concrete date (no nulls).
 * Overrides any LLM-assigned scheduledFor — this pass is authoritative.
 */

import type { MonthlyTask } from '@/controllers/hosting/agentSetup'

// Foundation is packed dense (instant agent work); everything else ≥5/day.
const FOUNDATION_PER_DAY = 14
const DEFAULT_PER_DAY = 6
const MAX_DAYS = 60

// On-site SEO/AEO + analytics + conversions + pixels = the foundation the user
// wants fixed ASAP. Matched by channel/type first, then keywords (He + En).
const FOUNDATION_KW = /pixel|פיקסל|conversion|המרה|המרות|consent|הסכמה|gtm|מנהל התגיות|\bga4\b|analytics|אנליטיקס|schema|תיוג מובנה|סכמ[התא]|canonical|קנונ|meta description|תיאור meta|כותרת.*כפול|title.*כפול|alt text|\bwebp\b|sitemap|breadcrumb|faqpage|organization schema|localbusiness|videoobject|article schema|קישור פנימי|internal link|\binp\b|dir=.?rtl|lang=.?he|קניבל|cannibal|tracking|מעקב|enhanced conversion|המרות משופרות|disavow|robots|hreflang/i

function isFoundation(t: MonthlyTask): boolean {
    if (t.channel === 'gtm' || t.channel === 'ga4') return true
    if (t.type === 'tracking_setup' || t.type === 'measurement_gap') return true
    if (t.type === 'website_change') return true   // an on-site technical change
    return FOUNDATION_KW.test(`${t.title || ''} ${t.summary || ''}`)
}

const PRIO: Record<string, number> = { P0: 0, P1: 1, P2: 2 }

function isBusinessDay(d: Date): boolean { const g = d.getDay(); return g !== 5 && g !== 6 } // skip Fri/Sat (IL weekend)
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function nextBusinessDay(d: Date): Date { let x = new Date(d); while (!isBusinessDay(x)) x = addDays(x, 1); return x }

function stamp(t: MonthlyTask, date: Date, dayIdx: number): void {
    const d = new Date(date); d.setHours(9, 0, 0, 0)
    ;(t as MonthlyTask).scheduledFor = d.toISOString()
    ;(t as MonthlyTask).weekOfMonth = Math.min(4, Math.floor(dayIdx / 5) + 1) as 1 | 2 | 3 | 4
}

export interface ScheduleResult {
    scheduled: number
    days: number
    foundationCount: number
    perDay: Array<{ date: string; count: number; foundation: number }>
}

/**
 * Assign scheduledFor to every task: foundation front-loaded & dense from day 1,
 * then the rest ≥DEFAULT_PER_DAY, dependencies respected. Mutates tasks in place.
 */
export function scheduleTasks(tasks: MonthlyTask[], startFrom: Date): ScheduleResult {
    if (!tasks.length) return { scheduled: 0, days: 0, foundationCount: 0, perDay: [] }

    const byId = new Map(tasks.map(t => [t.id, t]))
    const foundationCount = tasks.filter(isFoundation).length

    // Order: foundation first, then by priority, stable by original index.
    const ordered = tasks.map((t, i) => ({ t, i }))
        .sort((a, b) => {
            const fa = isFoundation(a.t) ? 0 : 1, fb = isFoundation(b.t) ? 0 : 1
            if (fa !== fb) return fa - fb
            const pa = PRIO[a.t.priority] ?? 1, pb = PRIO[b.t.priority] ?? 1
            if (pa !== pb) return pa - pb
            return a.i - b.i
        }).map(x => x.t)

    const remaining = [...ordered]
    const dayOf = new Map<string, number>()
    const perDay: ScheduleResult['perDay'] = []
    let dayIdx = 0
    let cursor = nextBusinessDay(startFrom)

    while (remaining.length && dayIdx < MAX_DAYS) {
        const foundationLeft = remaining.some(isFoundation)
        const target = foundationLeft ? FOUNDATION_PER_DAY : DEFAULT_PER_DAY
        let placed = 0, placedFoundation = 0

        for (let k = 0; k < remaining.length && placed < target;) {
            const t = remaining[k]
            const deps: string[] = (t as { dependsOn?: string[] }).dependsOn || []
            // A dependency must already be scheduled on an EARLIER day so this task runs after it.
            const ready = deps.every(d => !byId.has(d) || (dayOf.has(d) && (dayOf.get(d) as number) < dayIdx))
            if (ready) {
                stamp(t, cursor, dayIdx)
                dayOf.set(t.id, dayIdx)
                if (isFoundation(t)) placedFoundation++
                remaining.splice(k, 1)
                placed++
            } else { k++ }
        }

        if (placed === 0) {
            // Dependency stall (cycle / dep on a later task) — force-place the first to progress.
            const t = remaining.shift() as MonthlyTask
            stamp(t, cursor, dayIdx)
            dayOf.set(t.id, dayIdx)
            placed = 1
            if (isFoundation(t)) placedFoundation = 1
        }

        perDay.push({ date: new Date(cursor).toISOString().slice(0, 10), count: placed, foundation: placedFoundation })
        dayIdx++
        cursor = nextBusinessDay(addDays(cursor, 1))
    }

    // Cap hit — dump any leftovers on the last cursor day.
    for (const t of remaining) stamp(t, cursor, dayIdx)

    return { scheduled: tasks.length, days: dayIdx, foundationCount, perDay }
}