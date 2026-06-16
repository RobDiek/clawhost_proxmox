/**
 * Deterministic per-step automation annotator.
 *
 * Rule (Sergei, explicit): EVERYTHING the platform does itself — analysis,
 * reading/writing internal & external data via our integrations, writing content,
 * checking/comparing it, publishing it, changing ANY code (WordPress OR GitHub) —
 * must be marked AUTOMATED. `ידני` appears ONLY for steps/tasks that are genuinely
 * EXTERNAL and not platform-doable (talking to people, third-party platforms like
 * Wikidata, manual directory registration, outreach/PR, physical actions).
 *
 * So the per-step `automated` flag is: true UNLESS the step is external. A task is
 * fully manual only when it is an external-outreach/interview task. Merge,
 * monitoring (GSC), indexing requests (GSC), schema/meta/content edits, code PRs —
 * all internal → automated. This replaces the LLM's conservative per-step guesses.
 *
 * `executorReady` (capability auto + required integration connected) is computed
 * separately for diagnostics — it flags tasks displayed as auto whose underlying
 * executor is not yet wired for the connected channel (e.g. a WordPress-only
 * content executor on a GitHub tenant), which is a capability gap to close.
 */

import { classifyTask, CAPABILITIES } from './executorCapabilities'
import { isExternalOutreachTask } from './monthlyTaskExecutor'
import type { ConnectedStack } from './connectedStack'
import type { MonthlyTask } from '@/controllers/hosting/agentSetup'

const STACK_HAS: Record<string, (s: ConnectedStack) => boolean> = {
    wordpress: s => s.wordpress, github: s => s.github, google_ads: s => s.googleAdsExecutable,
    gtm: s => s.gtm, ga4: s => s.ga4, meta: s => s.meta, gbp: s => s.gbp, whatsapp: s => s.whatsapp,
    api_key: s => s.apiKey, dataforseo: () => false,
}
function requiresSatisfied(requires: string[], stack: ConnectedStack): boolean {
    return requires.every(entry => entry.split('|').some(tok => (STACK_HAS[tok.trim()] || (() => false))(stack)))
}

// A whole TASK is external (every step manual) when its core action requires a
// HUMAN to interact with external parties/platforms: outreach / PR / link recovery /
// directory registration / persona interviews / asking customers for reviews.
// NOTE: reading external data (competitor monitoring, Transparency Center) is NOT
// external — that's our integrations reading → automated.
const EXTERNAL_OUTREACH = 'פנייה יזומה|פנייה ל-?\\s*\\S|outreach|פיץ\'|\\bpitch\\b|פוסט אורח|guest post|יח"?צ\\b|שחזור קישור|הצעת תוכן ל'
const EXTERNAL_DIRECTORY = 'רישום ב-?\\s*\\S|directory|דירקטוריון|דפי זהב|\\bb144\\b|\\bzap\\b'
const EXTERNAL_PEOPLE = 'ראיון|\\binterview\\b|תיקוף פרסונ|שיחות? עם|בקשו? ביקורת מ|ask .*review'
const EXTERNAL_TASK = new RegExp(`${EXTERNAL_OUTREACH}|${EXTERNAL_DIRECTORY}|${EXTERNAL_PEOPLE}`, 'i')

// A STEP inside an otherwise-internal task that is itself external/off-platform.
// Deliberately TIGHT: merge / monitoring / indexing / schema / content / code /
// reading-external-data are NOT here — they are platform actions → automated.
const EXTERNAL_STEP = new RegExp(
    `wikidata|knowledge panel|מנוע ידע|ויקיפדיה|wikipedia|פיזי|offline|צרו פרופיל|פתחו פרופיל|open .*(profile|account)|crunchbase entr|`
    + `${EXTERNAL_OUTREACH}|${EXTERNAL_DIRECTORY}|${EXTERNAL_PEOPLE}`, 'i')

export interface AutoAnnotateResult { autoTasks: number; externalTasks: number; executorGaps: number }

/**
 * Re-derive per-step `automated` flags + stamp task.autoExecutable. Mutates in place.
 */
export function annotateAutoExecution(tasks: MonthlyTask[], stack?: ConnectedStack): AutoAnnotateResult {
    const res: AutoAnnotateResult = { autoTasks: 0, externalTasks: 0, executorGaps: 0 }
    if (!Array.isArray(tasks)) return res

    for (const t of tasks) {
        try {
            let externalTask = false
            try { externalTask = isExternalOutreachTask(t) } catch { /* ignore */ }
            if (!externalTask) externalTask = EXTERNAL_TASK.test(`${t.title || ''} ${t.summary || ''}`)

            const steps = (t as unknown as { actionPlan?: Array<{ step?: string; automated?: boolean }> }).actionPlan
            const tt = t as unknown as { autoExecutable?: boolean; autoCapabilityHe?: string }

            if (externalTask) {
                tt.autoExecutable = false
                tt.autoCapabilityHe = ''
                if (Array.isArray(steps)) for (const st of steps) { if (st) st.automated = false }
                res.externalTasks++
                continue
            }

            // Internal task → automated unless the specific step is external.
            tt.autoExecutable = true
            if (Array.isArray(steps)) {
                for (const st of steps) {
                    if (!st || !st.step) continue
                    st.automated = !EXTERNAL_STEP.test(st.step)
                }
            }
            res.autoTasks++

            // Diagnostics: is the executor actually wired for the connected channel?
            const { capabilityId, autonomy } = classifyTask(t)
            const cap = CAPABILITIES.find(c => c.id === capabilityId)
            tt.autoCapabilityHe = cap?.label_he || 'אוטומטי'
            const executorReady = !!cap && (autonomy === 'auto_write' || autonomy === 'auto_partial')
                && (stack ? requiresSatisfied(cap.requires, stack) : false)
            if (!executorReady) res.executorGaps++
        } catch { /* per-task non-fatal */ }
    }
    return res
}