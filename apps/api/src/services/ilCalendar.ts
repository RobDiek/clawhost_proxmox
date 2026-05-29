/**
 * K19 — Israeli calendar helpers for monthly plan scheduling.
 *
 * Pure functions; no side effects. Used by monthlyPlanGenerator's
 * scheduledFor assignment to skip Saturdays (Shabbat) and major
 * Israeli holidays so tasks don't land on days when nothing can
 * actually happen.
 *
 * Coverage: gregorian dates 2026-01-01 … 2026-12-31. Extend the
 * IL_HOLIDAYS_2026 array each year — alternative would be a hebcal
 * library import but for ~15 hardcoded dates the dependency cost
 * isn't worth it for the next 12 months.
 *
 * Holiday dates (גרגוריאני) — sources: hebcal.com, official IL gov:
 *   Purim          2026-03-03
 *   Pesach I       2026-04-02
 *   Pesach VII     2026-04-08
 *   Yom HaShoah    2026-04-14   (חצי-יום עבודה — treat as work day)
 *   Yom HaAtzmaut  2026-04-22
 *   Lag BaOmer     2026-05-05   (school holiday — work day)
 *   Shavuot        2026-05-22
 *   Tisha B'Av     2026-07-23   (חצי-יום — work day)
 *   Rosh Hashana I 2026-09-12
 *   Rosh Hashana II 2026-09-13
 *   Yom Kippur     2026-09-21
 *   Sukkot I       2026-09-26
 *   Sh. Atzeret    2026-10-03
 *   Chanukah       2026-12-04..12-12  (work days but reduced — keep as work)
 */

const IL_HOLIDAYS_2026 = new Set<string>([
    '2026-03-03',   // Purim
    '2026-04-02',   // Pesach I
    '2026-04-08',   // Pesach VII (Shevi'i shel Pesach)
    '2026-04-22',   // Yom HaAtzmaut
    '2026-05-22',   // Shavuot
    '2026-09-12',   // Rosh Hashana I
    '2026-09-13',   // Rosh Hashana II
    '2026-09-21',   // Yom Kippur
    '2026-09-26',   // Sukkot I
    '2026-10-03',   // Shemini Atzeret / Simchat Torah
])

function toIsoDate(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function parseIsoDate(s: string): Date {
    // Strip any time component; treat as UTC midnight for stable arithmetic.
    const dateOnly = s.slice(0, 10)
    return new Date(`${dateOnly}T00:00:00Z`)
}

export function isShabbat(iso: string): boolean {
    const d = parseIsoDate(iso)
    return d.getUTCDay() === 6   // 0=Sun, 6=Sat
}

export function isFriday(iso: string): boolean {
    const d = parseIsoDate(iso)
    return d.getUTCDay() === 5
}

export function isIsraeliHoliday(iso: string): boolean {
    return IL_HOLIDAYS_2026.has(iso.slice(0, 10))
}

/**
 * Work day = not Shabbat, not Friday (most IL businesses wind down
 * Thursday afternoon), not on a major IL holiday. Aligns with existing
 * monthlyPlanGuardrails.ts behavior (which already skips Fri + Sat) plus
 * adds holiday awareness.
 */
export function isWorkDay(iso: string): boolean {
    return !isShabbat(iso) && !isFriday(iso) && !isIsraeliHoliday(iso)
}

/**
 * Given an ISO date string, returns the next work day at or after it.
 * Saturday → push to Sunday. Israeli holiday → push to next non-holiday non-Saturday.
 * Hard cap at 14 iterations so a malformed date doesn't infinite-loop.
 */
export function nextWorkDay(iso: string): string {
    let d = parseIsoDate(iso)
    for (let i = 0; i < 14; i++) {
        const candidate = toIsoDate(d)
        if (isWorkDay(candidate)) return candidate
        d = new Date(d.getTime() + 24 * 3600 * 1000)
    }
    return toIsoDate(d)   // give up after 2 weeks
}

/**
 * Given a date assignment from the LLM (1=week 1, 2=week 2, etc.) and the
 * plan generation timestamp, returns a concrete YYYY-MM-DD that:
 *   - falls inside the target week
 *   - is a work day (not Shabbat, not a major IL holiday)
 *   - is at-or-after the plan generation date
 *
 * Used as a post-process on monthlyPlanGenerator's existing scheduledFor
 * assignment so the LLM's "weekOfMonth=3" hint maps to a real calendar date
 * that the founder can actually act on.
 */
export function scheduleInWeek(weekOfMonth: 1 | 2 | 3 | 4, generatedAt: Date): string {
    const startOfMonth = new Date(Date.UTC(generatedAt.getUTCFullYear(), generatedAt.getUTCMonth(), 1))
    // Week 1 = day 1-7, Week 2 = day 8-14, Week 3 = day 15-21, Week 4 = day 22-28
    const targetDayOfMonth = (weekOfMonth - 1) * 7 + 2
    const target = new Date(Date.UTC(startOfMonth.getUTCFullYear(), startOfMonth.getUTCMonth(), targetDayOfMonth))
    // Never schedule in the past — clamp to gen day at minimum.
    const today = new Date(Date.UTC(generatedAt.getUTCFullYear(), generatedAt.getUTCMonth(), generatedAt.getUTCDate()))
    const baseline = target.getTime() < today.getTime() ? today : target
    return nextWorkDay(toIsoDate(baseline))
}