/**
 * Deterministic per-step automation annotator.
 *
 * The per-step `automated` flag on action plans is GUESSED by the LLM (detailer)
 * and is inconsistent — it only flags the step that maps to an obvious adapter
 * (e.g. github_create_pr), leaving discovery + content-writing steps "ידני" even
 * though the SAME auto-capability performs them. Result: a task that the executor
 * fully auto-runs on approve shows only 1/6 steps as automatic.
 *
 * This re-derives the flags from the TASK's real capability (classifyTask) + the
 * connected stack: if the task is auto-executable and its required integration is
 * connected, every step up to & including the executor's write/publish step is
 * marked automated — EXCEPT steps that are inherently manual (merge-to-prod,
 * monitoring, interviews, outreach, external entities). Post-publish steps
 * (merge / index / monitor) stay manual. Honest, not over-claiming.
 *
 * Also stamps task.autoExecutable + task.autoCapabilityHe for a task-level badge.
 */

import { classifyTask, CAPABILITIES } from './executorCapabilities'
import type { ConnectedStack } from './connectedStack'
import type { MonthlyTask } from '@/controllers/hosting/agentSetup'

// integration token (capability.requires) → is it live in the connected stack?
const STACK_HAS: Record<string, (s: ConnectedStack) => boolean> = {
    wordpress: s => s.wordpress,
    github: s => s.github,
    google_ads: s => s.googleAdsExecutable,
    gtm: s => s.gtm,
    ga4: s => s.ga4,
    meta: s => s.meta,
    gbp: s => s.gbp,
    whatsapp: s => s.whatsapp,
    api_key: s => s.apiKey,
    // not derivable from the stack → don't auto-confirm
    dataforseo: () => false,
}

function requiresSatisfied(requires: string[], stack: ConnectedStack): boolean {
    return requires.every(entry => entry.split('|').some(tok => (STACK_HAS[tok.trim()] || (() => false))(stack)))
}

// Steps that stay MANUAL even within an auto-capable task — a human gate or an
// inherently external/periodic action the executor does not perform.
const MANUAL_STEP = /מיזוג|\bmerge\b|deploy.*ידני|ראיון|interview|wikidata|knowledge panel|מנוע ידע|פנייה|outreach|צילום מסך|screenshot|ניטור|מעקב|monitor|בקשת אינדוקס|url inspection|request indexing|רישום ב-|directory|דירקטוריון|ידנית/i

/**
 * Annotate each task's auto-executability + re-derive per-step `automated` flags.
 * Mutates in place. Returns the number of tasks marked auto-executable.
 */
export function annotateAutoExecution(tasks: MonthlyTask[], stack?: ConnectedStack): number {
    if (!Array.isArray(tasks)) return 0
    let autoCount = 0
    for (const t of tasks) {
        try {
            const { capabilityId, autonomy } = classifyTask(t)
            const cap = CAPABILITIES.find(c => c.id === capabilityId)
            const requires = cap?.requires || []
            const connected = stack ? requiresSatisfied(requires, stack) : false
            const autoExecutable = (autonomy === 'auto_write' || autonomy === 'auto_partial') && connected
            ;(t as unknown as { autoExecutable?: boolean }).autoExecutable = autoExecutable
            ;(t as unknown as { autoCapabilityHe?: string }).autoCapabilityHe = autoExecutable ? (cap?.label_he || '') : ''

            const steps = (t as unknown as { actionPlan?: Array<{ step?: string; automated?: boolean }> }).actionPlan
            if (autoExecutable && Array.isArray(steps) && steps.length) {
                // The executor produces everything up to & including the publish step
                // the LLM already flagged. Mark those auto (minus inherently-manual);
                // leave post-publish steps (merge/index/monitor) untouched.
                let lastAuto = -1
                for (let i = 0; i < steps.length; i++) if (steps[i] && steps[i].automated) lastAuto = i
                if (lastAuto >= 0) {
                    for (let i = 0; i <= lastAuto; i++) {
                        const st = steps[i]
                        if (st && st.step && !MANUAL_STEP.test(st.step)) st.automated = true
                    }
                }
                autoCount++
            }
        } catch { /* per-task non-fatal */ }
    }
    return autoCount
}