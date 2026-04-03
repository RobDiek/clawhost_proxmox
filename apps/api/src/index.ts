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

// Trial manager — check trial expiry every hour
import { runTrialManager } from '@/jobs/trialManager'
setInterval(runTrialManager, 3600000) // every hour
setTimeout(runTrialManager, 60000) // first run after 1 min