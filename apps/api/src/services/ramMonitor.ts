/**
 * Proactive RAM Monitor — checks all running instances every 10 minutes.
 * Alerts users via Telegram and admin when RAM usage exceeds thresholds.
 */

import { db } from '@/db'
import { instances } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { Client } from 'ssh2'
import { readFileSync } from 'fs'
import telegram from './telegram'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'
const CHECK_INTERVAL = 10 * 60 * 1000 // 10 minutes

// Thresholds (percentage of plan RAM)
const WARN_THRESHOLD = 80
const CRITICAL_THRESHOLD = 90

// Plan RAM limits in MB
const PLAN_RAM_MB: Record<string, number> = {
    personal: 4096,
    business: 8192,
    pro: 16384,
    developer: 32768,
}

// Track alerts to avoid spam (instanceId -> last alert level + time)
const alertHistory = new Map<string, { level: string; at: number }>()
const ALERT_COOLDOWN = 60 * 60 * 1000 // 1 hour between same-level alerts

let sshKeyCache: Buffer | null = null
function getSSHKey(): Buffer {
    if (!sshKeyCache) sshKeyCache = readFileSync(SSH_KEY_PATH)
    return sshKeyCache
}

function sshExec(ip: string, command: string, password?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        let output = ''
        const timer = setTimeout(() => { conn.end(); reject(new Error('SSH timeout')) }, 15000)
        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { clearTimeout(timer); conn.end(); return reject(err) }
                stream.on('data', (d: Buffer) => { output += d.toString() })
                stream.stderr.on('data', (d: Buffer) => { output += d.toString() })
                stream.on('close', () => { clearTimeout(timer); conn.end(); resolve(output) })
            })
        })
        .on('error', (err) => { clearTimeout(timer); reject(err) })

        const opts: Record<string, unknown> = { host: ip, port: 22, username: 'root', readyTimeout: 10000 }
        if (password) opts.password = password
        try { opts.privateKey = getSSHKey() } catch { /* key not available */ }
        conn.connect(opts)
    })
}

interface RamStatus {
    instanceId: string
    planKey: string
    ramUsedMb: number
    ramTotalMb: number
    planRamMb: number
    usagePercent: number
    level: 'ok' | 'warning' | 'critical'
    suggestedPlan?: string
}

async function checkInstanceRam(instance: {
    id: string
    ip: string | null
    rootPassword: string | null
    planKey: string
    telegramChatId: string | null
}): Promise<RamStatus | null> {
    if (!instance.ip) return null

    try {
        const output = await sshExec(
            instance.ip,
            `free -m | awk 'NR==2{print $3,$2}'`,
            instance.rootPassword || undefined
        )
        const [usedStr, totalStr] = output.trim().split(/\s+/)
        const ramUsedMb = parseInt(usedStr) || 0
        const ramTotalMb = parseInt(totalStr) || 0
        const planRamMb = PLAN_RAM_MB[instance.planKey || 'personal'] || 4096
        const usagePercent = ramTotalMb > 0 ? Math.round((ramUsedMb / ramTotalMb) * 100) : 0

        let level: 'ok' | 'warning' | 'critical' = 'ok'
        if (usagePercent >= CRITICAL_THRESHOLD) level = 'critical'
        else if (usagePercent >= WARN_THRESHOLD) level = 'warning'

        let suggestedPlan: string | undefined
        if (level !== 'ok') {
            const plans = Object.entries(PLAN_RAM_MB).sort((a, b) => a[1] - b[1])
            const bigger = plans.find(([key, ram]) => ram > planRamMb)
            if (bigger) suggestedPlan = bigger[0]
        }

        return {
            instanceId: instance.id,
            planKey: instance.planKey,
            ramUsedMb,
            ramTotalMb,
            planRamMb,
            usagePercent,
            level,
            suggestedPlan,
        }
    } catch {
        return null
    }
}

function shouldAlert(instanceId: string, level: string): boolean {
    const prev = alertHistory.get(instanceId)
    if (!prev) return true
    if (prev.level !== level) return true // level changed
    if (Date.now() - prev.at > ALERT_COOLDOWN) return true // cooldown passed
    return false
}

const PLAN_NAMES_HE: Record<string, string> = {
    personal: 'אישי',
    business: 'עסקי',
    pro: 'פרו',
    developer: 'מפתח',
}

async function sendRamAlert(instance: {
    id: string
    telegramChatId: string | null
}, status: RamStatus) {
    const planHe = PLAN_NAMES_HE[status.planKey] || status.planKey

    if (status.level === 'warning') {
        // User notification
        if (instance.telegramChatId) {
            await telegram.sendMessage(instance.telegramChatId,
                `⚠️ *זיכרון RAM גבוה — ${status.usagePercent}%*\n` +
                `השרת שלך משתמש ב-${status.ramUsedMb}MB מתוך ${status.ramTotalMb}MB\n` +
                `תוכנית: ${planHe}\n\n` +
                `💡 _שדרוג תוכנית יאפשר יותר סוכנים ויציבות טובה יותר_`
            )
        }
        // Admin alert
        await telegram.alertAdmin(
            `⚠️ RAM Warning: Instance ${instance.id}\n` +
            `${status.ramUsedMb}/${status.ramTotalMb}MB (${status.usagePercent}%) — plan: ${status.planKey}` +
            (status.suggestedPlan ? `\nSuggested: ${status.suggestedPlan}` : '')
        )
    } else if (status.level === 'critical') {
        if (instance.telegramChatId) {
            await telegram.sendMessage(instance.telegramChatId,
                `🔴 *זיכרון RAM קריטי — ${status.usagePercent}%*\n` +
                `השרת שלך כמעט מלא: ${status.ramUsedMb}MB מתוך ${status.ramTotalMb}MB\n` +
                `תוכנית: ${planHe}\n\n` +
                (status.suggestedPlan
                    ? `⬆️ *מומלץ לשדרג לתוכנית ${PLAN_NAMES_HE[status.suggestedPlan] || status.suggestedPlan}*\n`
                    : '') +
                `_ללא שדרוג, הסוכנים עלולים להאט או להפסיק_`
            )
        }
        await telegram.alertAdmin(
            `🔴 RAM CRITICAL: Instance ${instance.id}\n` +
            `${status.ramUsedMb}/${status.ramTotalMb}MB (${status.usagePercent}%) — plan: ${status.planKey}\n` +
            `ACTION NEEDED` +
            (status.suggestedPlan ? ` — suggest upgrade to ${status.suggestedPlan}` : '')
        )
    }

    alertHistory.set(instance.id, { level: status.level, at: Date.now() })
}

// Last check results (for API endpoint)
const lastResults = new Map<string, RamStatus>()

async function checkAllInstances() {
    try {
        const allInstances = await db.select({
            id: instances.id,
            ip: instances.ip,
            rootPassword: instances.rootPassword,
            planKey: instances.planKey,
            status: instances.status,
            telegramChatId: instances.telegramChatId,
        }).from(instances).where(eq(instances.status, 'running'))

        for (const inst of allInstances) {
            const status = await checkInstanceRam(inst)
            if (!status) continue

            lastResults.set(inst.id, status)

            if (status.level !== 'ok' && shouldAlert(inst.id, status.level)) {
                await sendRamAlert(inst, status)
            }
        }
    } catch (err) {
        console.error('RAM monitor error:', err)
    }
}

let monitorInterval: ReturnType<typeof setInterval> | null = null

export function startRamMonitor() {
    console.log('  RAM monitor started (every 10min)')
    // First check after 2 minutes (let instances boot)
    setTimeout(() => {
        checkAllInstances()
        monitorInterval = setInterval(checkAllInstances, CHECK_INTERVAL)
    }, 2 * 60 * 1000)
}

export function stopRamMonitor() {
    if (monitorInterval) clearInterval(monitorInterval)
}

/** Get cached RAM status for a specific instance */
export function getRamStatus(instanceId: string): RamStatus | null {
    return lastResults.get(instanceId) || null
}

/** Get all cached RAM statuses */
export function getAllRamStatuses(): RamStatus[] {
    return Array.from(lastResults.values())
}

/** Force check a specific instance (for API endpoint) */
export async function checkRamNow(instanceId: string): Promise<RamStatus | null> {
    const [inst] = await db.select({
        id: instances.id,
        ip: instances.ip,
        rootPassword: instances.rootPassword,
        planKey: instances.planKey,
        telegramChatId: instances.telegramChatId,
    }).from(instances).where(eq(instances.id, instanceId))

    if (!inst?.ip) return null

    const status = await checkInstanceRam(inst)
    if (status) {
        lastResults.set(instanceId, status)
        if (status.level !== 'ok' && shouldAlert(instanceId, status.level)) {
            await sendRamAlert(inst, status)
        }
    }
    return status
}
