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

// Trial manager — check trial expiry every hour
import { runTrialManager } from '@/jobs/trialManager'
setInterval(runTrialManager, 3600000) // every hour
setTimeout(runTrialManager, 60000) // first run after 1 min