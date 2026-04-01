import { spawn, execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import configStore from '@/main/services/configStore'
import nodeBinary from '@/main/services/nodeBinary'
import { t } from '@openclaw/i18n'

const childRefs = new Map<string, number>()

const getPidPath = (clawDir: string): string => {
    return path.join(clawDir, 'gateway.pid')
}

const writePid = (clawDir: string, pid: number): void => {
    fs.writeFileSync(getPidPath(clawDir), String(pid))
}

const readPid = (clawDir: string): number | null => {
    const pidPath = getPidPath(clawDir)
    if (!fs.existsSync(pidPath)) return null
    try {
        const pid = parseInt(fs.readFileSync(pidPath, 'utf-8').trim(), 10)
        return isNaN(pid) ? null : pid
    } catch {
        return null
    }
}

const removePid = (clawDir: string): void => {
    const pidPath = getPidPath(clawDir)
    try {
        if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath)
    } catch {}
}

const isPidAlive = (pid: number): boolean => {
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

const parseEnvFile = (envPath: string): Record<string, string> => {
    const env: Record<string, string> = {}
    if (!fs.existsSync(envPath)) return env
    const content = fs.readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIndex = trimmed.indexOf('=')
        if (eqIndex === -1) continue
        const key = trimmed.slice(0, eqIndex).trim()
        const value = trimmed.slice(eqIndex + 1).trim()
        env[key] = value
    }
    return env
}

const killProcessOnPort = (port: number): void => {
    try {
        const output = execSync(`lsof -ti :${port}`, {
            encoding: 'utf-8',
            timeout: 3000
        }).trim()
        if (!output) return
        for (const pidStr of output.split('\n')) {
            const pid = parseInt(pidStr.trim(), 10)
            if (!isNaN(pid)) {
                try {
                    process.kill(pid, 'SIGKILL')
                } catch {}
            }
        }
    } catch {}
}

const startGateway = async (
    clawId: string,
    clawDir: string,
    port: number,
    version: string,
    token: string
): Promise<void> => {
    if (isRunning(clawId)) {
        await stopGateway(clawId)
    }

    killProcessOnPort(port)

    const clawBin = path.join(clawDir, 'node_modules', '.bin', 'openclaw')
    const versionDir = configStore.getVersionDir(version)
    const sharedBin = path.join(versionDir, 'node_modules', '.bin', 'openclaw')
    const openclawBin = fs.existsSync(clawBin) ? clawBin : sharedBin

    if (!fs.existsSync(openclawBin)) {
        throw new Error(t('go.versionNotInstalled', { version }))
    }

    const nodePath = nodeBinary.getNodeBinaryPath()
    const envPath = path.join(clawDir, '.env')
    const logPath = path.join(clawDir, 'gateway.log')
    const clawEnv = parseEnvFile(envPath)
    const configPath = path.join(clawDir, 'openclaw.json')

    const logFd = fs.openSync(logPath, 'a')

    const child = spawn(
        nodePath,
        [openclawBin, 'gateway', '--port', String(port)],
        {
            cwd: clawDir,
            env: {
                ...process.env,
                ...clawEnv,
                OPENCLAW_CONFIG_PATH: configPath,
                OPENCLAW_STATE_DIR: clawDir,
                ...(token && { OPENCLAW_GATEWAY_TOKEN: token }),
                NODE_ENV: 'production'
            },
            stdio: ['ignore', logFd, logFd],
            detached: true
        }
    )

    const pid = child.pid
    if (!pid) {
        fs.closeSync(logFd)
        throw new Error(
            t('go.failedToStartProcess', { reason: 'no PID assigned' })
        )
    }

    writePid(clawDir, pid)
    childRefs.set(clawId, pid)
    child.unref()

    let settled = false

    await new Promise<void>((resolve, reject) => {
        const settle = (fn: () => void) => {
            if (settled) return
            settled = true
            fs.closeSync(logFd)
            fn()
        }

        const checkTimer = setTimeout(() => {
            if (isPidAlive(pid)) {
                settle(() => resolve())
            } else {
                removePid(clawDir)
                childRefs.delete(clawId)
                const logs = getLogs(clawDir, 20)
                settle(() =>
                    reject(
                        new Error(
                            logs
                                ? t('go.processExitedImmediately', { logs })
                                : t('go.processExitedImmediatelyNoLogs')
                        )
                    )
                )
            }
        }, 1500)

        child.once('exit', (code) => {
            clearTimeout(checkTimer)
            removePid(clawDir)
            childRefs.delete(clawId)
            if (code !== null && code !== 0) {
                const logs = getLogs(clawDir, 20)
                settle(() =>
                    reject(
                        new Error(
                            logs
                                ? t('go.processExitedWithCode', {
                                      code: String(code),
                                      logs
                                  })
                                : t('go.processExitedWithCodeNoLogs', {
                                      code: String(code)
                                  })
                        )
                    )
                )
            } else {
                settle(() =>
                    reject(new Error(t('go.processExitedUnexpectedly')))
                )
            }
        })

        child.once('error', (err) => {
            clearTimeout(checkTimer)
            removePid(clawDir)
            childRefs.delete(clawId)
            settle(() =>
                reject(
                    new Error(
                        t('go.failedToStartProcess', { reason: err.message })
                    )
                )
            )
        })
    })
}

const stopGateway = async (clawId: string): Promise<void> => {
    const claw = configStore.findClaw(clawId)
    const clawDir = claw ? configStore.getClawDir(claw.name) : null

    let pid = childRefs.get(clawId) || null
    if (!pid && clawDir) {
        pid = readPid(clawDir)
    }
    if (!pid || !isPidAlive(pid)) {
        childRefs.delete(clawId)
        if (clawDir) removePid(clawDir)
        return
    }

    try {
        process.kill(pid, 'SIGTERM')
    } catch {
        childRefs.delete(clawId)
        if (clawDir) removePid(clawDir)
        return
    }

    await new Promise<void>((resolve) => {
        let elapsed = 0
        const interval = setInterval(() => {
            elapsed += 200
            if (!isPidAlive(pid)) {
                clearInterval(interval)
                childRefs.delete(clawId)
                if (clawDir) removePid(clawDir)
                resolve()
                return
            }
            if (elapsed >= 5000) {
                clearInterval(interval)
                try {
                    process.kill(pid, 'SIGKILL')
                } catch {}
                childRefs.delete(clawId)
                if (clawDir) removePid(clawDir)
                resolve()
            }
        }, 200)
    })
}

const restartGateway = async (
    clawId: string,
    clawDir: string,
    port: number,
    version: string,
    token: string
): Promise<void> => {
    await stopGateway(clawId)
    await startGateway(clawId, clawDir, port, version, token)
}

const isRunning = (clawId: string): boolean => {
    const pid = childRefs.get(clawId)
    if (pid && isPidAlive(pid)) return true

    const claw = configStore.findClaw(clawId)
    if (!claw) return false
    const clawDir = configStore.getClawDir(claw.name)
    const filePid = readPid(clawDir)
    if (filePid && isPidAlive(filePid)) {
        childRefs.set(clawId, filePid)
        return true
    }

    childRefs.delete(clawId)
    if (filePid) removePid(clawDir)
    return false
}

const getProcessInfo = (clawId: string): { pid: number } | null => {
    if (!isRunning(clawId)) return null
    const pid = childRefs.get(clawId)
    return pid ? { pid } : null
}

const getLogs = (clawDir: string, lines: number = 100): string => {
    const logPath = path.join(clawDir, 'gateway.log')
    if (!fs.existsSync(logPath)) return ''
    const content = fs.readFileSync(logPath, 'utf-8')
    const allLines = content.split('\n')
    return allLines.slice(-lines).join('\n')
}

const stopAll = async (): Promise<void> => {
    const config = configStore.readConfig()
    const stopPromises = config.claws.map((claw) => stopGateway(claw.id))
    await Promise.all(stopPromises)
}

const cleanOrphanedProcesses = (): void => {
    const config = configStore.readConfig()
    const clawNames = new Set(config.claws.map((c) => c.name))
    const clawsDir = path.join(configStore.getBaseDir(), 'claws')
    if (!fs.existsSync(clawsDir)) return
    for (const dir of fs.readdirSync(clawsDir)) {
        if (clawNames.has(dir)) continue
        const pidPath = path.join(clawsDir, dir, 'gateway.pid')
        if (!fs.existsSync(pidPath)) continue
        const pid = parseInt(fs.readFileSync(pidPath, 'utf-8').trim(), 10)
        if (!isNaN(pid) && isPidAlive(pid)) {
            try {
                process.kill(pid, 'SIGKILL')
            } catch {}
        }
        try {
            fs.unlinkSync(pidPath)
        } catch {}
    }
}

const processManager = {
    startGateway,
    stopGateway,
    restartGateway,
    isRunning,
    getProcessInfo,
    getLogs,
    stopAll,
    cleanOrphanedProcesses
}

export default processManager