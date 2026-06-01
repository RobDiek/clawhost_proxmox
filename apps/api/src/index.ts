import 'dotenv/config'

import type { Server } from 'http'

import { serve } from '@hono/node-server'
import { readFileSync } from 'fs'
import { resolve } from 'path'

import app from '@/app'
import setupTerminalSocket from '@/services/terminalSocket'
import { startOnboardingBot } from '@/services/onboardingBot'
import { setupChatWebSocket } from '@/services/chatServer'
import { setupTerminalServer } from '@/services/terminalServer'

const port = Number(process.env.PORT)
const pkg = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf-8')
)

const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
const green = (s: string) => `\x1b[32m${s}\x1b[0m`

const server = serve(
    {
        fetch: app.fetch,
        port,
        hostname: '0.0.0.0'
    },
    () => {
        process.stdout.write('\n')
        process.stdout.write(
            `  ${cyan(bold('OPENCLAW API'))}  ${green(`v${pkg.version}`)}\n`
        )
        process.stdout.write('\n')
        process.stdout.write(
            `  ${dim('➜')}  ${bold('Local:')}   ${cyan(`http://localhost:${port}/`)}\n`
        )
        process.stdout.write(
            `  ${dim('➜')}  ${bold('Network:')} ${cyan(`http://0.0.0.0:${port}/`)}\n`
        )
        process.stdout.write('\n')
    }
)

// WebSocket handlers (order matters — first registered gets first chance)
setupChatWebSocket(server as Server)
setupTerminalServer(server as Server)

// Graceful shutdown — close server and release port before exit
function shutdown(signal: string) {
    console.log(`\n${signal} received — shutting down gracefully...`)
    ;(server as Server).close(() => {
        console.log('Server closed, port released.')
        process.exit(0)
    })
    // Force exit after 5s if server won't close
    setTimeout(() => {
        console.error('Forced exit after timeout')
        process.exit(1)
    }, 5000)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Start agent output sync service (polls VPS every 5 min)
import { startOutputSync } from '@/services/outputSync'
startOutputSync()

// Start model health monitor (checks every 6 hours)
import { startModelMonitor } from '@/services/modelMonitor'
startModelMonitor()

// Start RAM monitor (checks all instances every 10 min)
import { startRamMonitor } from '@/services/ramMonitor'
startRamMonitor()

// Start instance health monitor (checks all instances every 5 min, auto-restarts)
import { startInstanceMonitor } from '@/services/instanceMonitor'
startInstanceMonitor()

// Phase B5 — daily creative performance sync (Meta Insights + Google Ads)
import { startCreativePerformanceSync } from '@/services/creativePerformanceSync'
startCreativePerformanceSync()

// Phase B6 — daily A/B hypothesis analyzer (runs 15min after perfSync)
import { startHypothesisAnalyzer } from '@/services/hypothesisAnalyzer'
startHypothesisAnalyzer()

// Phase D — weekly creative report (Monday 08:00 UTC)
import { startWeeklyCreativeReport } from '@/services/weeklyCreativeReport'
startWeeklyCreativeReport()

// Weekly Ops Brief — menateach strategic brief, lands in approval queue
import { startWeeklyOpsBrief } from '@/services/weeklyOpsBrief'
startWeeklyOpsBrief()

// Bid Transition Runner — daily check, proposes flip from MAXIMIZE_CLICKS
// to tCPA/MAXIMIZE_CONVERSIONS when 30+ conversions accumulated.
import { startBidTransitionRunner } from '@/services/bidTransitionRunner'
startBidTransitionRunner()

// Objective Transition Runner — daily; applies the tenant's chosen bidding
// objective (target ROAS / target CPA) to IMPORTED campaigns (no bidContract,
// e.g. Packing Station's Pmax/Search on a shared MCC) once enough conversions
// accrue. Propose-only (pending_review); handles Pmax vs standard target fields.
import { startObjectiveTransitionRunner } from '@/services/objectiveTransitionRunner'
startObjectiveTransitionRunner()

// Monthly Re-audit — fires on day-1 of each month for clients with active
// paid_search pipeline; surfaces methodology shifts via auditDiff.
import { startMonthlyReauditRunner } from '@/services/monthlyReauditRunner'
startMonthlyReauditRunner()

// One-shot research data migration: legacy researchData.stage1..stage5
// → new intent + plan + results shape (docs/research-pipeline-design.md §10).
// Idempotent — already-migrated rows are skipped. Deferred 30s after boot
// to keep startup fast and avoid blocking health probes.
import { runResearchDataMigration } from '@/services/research/migrate'
setTimeout(() => {
    runResearchDataMigration().catch((err) => {
        console.error('[researchDataMigration] error:', (err as Error).message)
    })
}, 30_000)

// Strategy Lab — weekly learner that ranks winners/losers across 6 dimensions
// from actual performance data, then feeds recommendations back into the next
// content plan generation.
import { startStrategyLearner } from '@/services/strategyLearner'
startStrategyLearner()

// Phase F — facts pusher (every 6h)
import { startFactsPusher } from '@/services/factsPusher'
startFactsPusher()

// Phase B — content plan metrics collector (every 24h)
import { startMetricsCollectorCron, startOptimizationCron } from '@/services/contentPlanMetrics'
startMetricsCollectorCron()

// "Marketing manager under the hood" — weekly auto-optimization (Opus 4.7)
// feeds insights silently into content plan + drafting + reports.
startOptimizationCron()

// Phase 3 — plan-to-agent draft runner (every 60min)
import { startPlanDraftRunner } from '@/services/planDraftRunner'
startPlanDraftRunner()

// K15 — Generic Deferred Actions scheduler — replaces K14 bidding-only.
// Scans research_data.deferredActions[] for ALL kinds (bidding_strategy +
// future: plugin_tracking_disable, ga4_setting_change, campaign_pause).
// Each kind self-registers a handler with custom restore + validation logic.
import { runDeferredActionsScheduler } from '@/services/deferredActions/scheduler'
setInterval(() => { runDeferredActionsScheduler().catch(err => console.error('[deferredActions] cron error:', err)) }, 24 * 3600 * 1000)
setTimeout(() => { runDeferredActionsScheduler().catch(err => console.error('[deferredActions] first run error:', err)) }, 120 * 1000)

// K18 — Task Outcome Attribution: daily scan of completed monthly_task tasks
// where completedAt + expectedImpact.horizon has elapsed but actualImpact has
// not been measured yet. Routes per-channel adapter, writes actualImpact +
// category ('hit' | 'mixed' | 'missed' | 'unknown') so monthlyReauditRunner
// can learn what worked vs missed and shape next month's plan.
import { runTaskOutcomeAttribution } from '@/services/taskOutcomeAttribution'
setInterval(() => { runTaskOutcomeAttribution().catch(err => console.error('[taskOutcomeAttribution] cron error:', err)) }, 24 * 3600 * 1000)
setTimeout(() => { runTaskOutcomeAttribution().catch(err => console.error('[taskOutcomeAttribution] first run error:', err)) }, 180 * 1000)

// K20 — Failed Task Retry Runner: every 30 min, re-fires failed monthly_task
// entries whose nextRetryAt has elapsed and retryCount < 3. Exponential
// backoff (1h, 4h, 24h) is set by monthlyTaskExecutor's catch block. After
// 3 retries the executor spawns an investigate child task and stops retrying.
import { runFailedTaskRetry } from '@/services/failedTaskRetryRunner'
setInterval(() => { runFailedTaskRetry().catch(err => console.error('[failedTaskRetry] cron error:', err)) }, 30 * 60 * 1000)
setTimeout(() => { runFailedTaskRetry().catch(err => console.error('[failedTaskRetry] first run error:', err)) }, 240 * 1000)

// K28 — SEO Monitoring Runner: daily tick (GSC delta digest), weekly tick
// (Helpful Content score + AEO citation probe), monthly tick (Wikidata + KP).
// Persists everything under research_data.seoMonitoring with day-keyed
// idempotency so re-runs within 24h don't double-write.
import { runSeoMonitoring } from '@/services/seoMonitoringRunner'
setInterval(() => { runSeoMonitoring().catch(err => console.error('[seoMonitoring] cron error:', err)) }, 24 * 60 * 60 * 1000)
setTimeout(() => { runSeoMonitoring().catch(err => console.error('[seoMonitoring] first run error:', err)) }, 360 * 1000)

// Conversion Setup Audit — ONE-TIME check ~24h after each Mazhir GTM/conversion
// auto-setup. Catches the Packing Station class of failure: own purchase signal
// not firing in GA4, or a sibling brand's conversion action contaminating the
// campaigns' bidding. Hourly sweep; each setup is audited exactly once (stamped
// via research_data.mazhirGtm.auditRanAt). Surfaces pending_review + Telegram,
// never auto-fixes.
import { runConversionSetupAudit } from '@/services/conversionSetupAudit'
setInterval(() => { runConversionSetupAudit().catch(err => console.error('[conversionAudit] cron error:', err)) }, 60 * 60 * 1000)
setTimeout(() => { runConversionSetupAudit().catch(err => console.error('[conversionAudit] first run error:', err)) }, 420 * 1000)

// Trial manager — check trial expiry every hour
import { runTrialManager } from '@/jobs/trialManager'
setInterval(runTrialManager, 3600000) // every hour
setTimeout(runTrialManager, 60000) // first run after 1 min

// Phase 3.6 — DFS credits: daily FX rate refresh + hourly auto-topup sweep
import { startFxRefreshCron } from '@/services/dfsCredits/fxRefresh'
import { startAutoTopupCron } from '@/services/dfsCredits/autoTopup'
startFxRefreshCron()
startAutoTopupCron()