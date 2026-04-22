import { spawn, execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import configStore from '@/main/services/configStore'
import nodeBinary from '@/main/services/nodeBinary'
import { t } from '@openclaw/i18n'

const childRefs = new Map<string, number>()

const getPidPath = (agentDir: string): string => {
    return path.join(agentDir, 'gateway.pid')
}

const writePid = (agentDir: string, pid: number): void => {
    fs.writeFileSync(getPidPath(agentDir), String(pid))
}

const readPid = (agentDir: string): number | null => {
    const pidPath = getPidPath(agentDir)
    if (!fs.existsSync(pidPath)) return null
    try {
        const pid = parseInt(fs.readFileSync(pidPath, 'utf-8').trim(), 10)
        return isNaN(pid) ? null : pid
    } catch {
        return null
    }
}

const removePid = (agentDir: string): void => {
    const pidPath = getPidPath(agentDir)
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
    agentId: string,
    agentDir: string,
    port: number,
    version: string,
    token: string
): Promise<void> => {
    if (isRunning(agentId)) {
        await stopGateway(agentId)
    }

    killProcessOnPort(port)

    const agentBin = path.join(agentDir, 'node_modules', '.bin', 'openclaw')
    const versionDir = configStore.getVersionDir(version)
    const sharedBin = path.join(versionDir, 'node_modules', '.bin', 'openclaw')
    const openclawBin = fs.existsSync(agentBin) ? agentBin : sharedBin

    if (!fs.existsSync(openclawBin)) {
        throw new Error(t('go.versionNotInstalled', { version }))
    }

    const nodePath = nodeBinary.getNodeBinaryPath()
    const envPath = path.join(agentDir, '.env')
    const logPath = path.join(agentDir, 'gateway.log')
    const agentEnv = parseEnvFile(envPath)
    const configPath = path.join(agentDir, 'openclaw.json')

    const logFd = fs.openSync(logPath, 'a')

    const child = spawn(
        nodePath,
        [openclawBin, 'gateway', '--port', String(port)],
        {
            cwd: agentDir,
            env: {
                ...process.env,
                ...agentEnv,
                OPENCLAW_CONFIG_PATH: configPath,
                OPENCLAW_STATE_DIR: agentDir,
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

    writePid(agentDir, pid)
    childRefs.set(agentId, pid)
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
                removePid(agentDir)
                childRefs.delete(agentId)
                const logs = getLogs(agentDir, 20)
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
            removePid(agentDir)
            childRefs.delete(agentId)
            if (code !== null && code !== 0) {
                const logs = getLogs(agentDir, 20)
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
            removePid(agentDir)
            childRefs.delete(agentId)
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

const stopGateway = async (agentId: string): Promise<void> => {
    const agent = configStore.findAgent(agentId)
    const agentDir = agent ? configStore.getAgentDir(agent.name) : null

    let pid = childRefs.get(agentId) || null
    if (!pid && agentDir) {
        pid = readPid(agentDir)
    }
    if (!pid || !isPidAlive(pid)) {
        childRefs.delete(agentId)
        if (agentDir) removePid(agentDir)
        return
    }

    try {
        process.kill(pid, 'SIGTERM')
    } catch {
        childRefs.delete(agentId)
        if (agentDir) removePid(agentDir)
        return
    }

    await new Promise<void>((resolve) => {
        let elapsed = 0
        const interval = setInterval(() => {
            elapsed += 200
            if (!isPidAlive(pid)) {
                clearInterval(interval)
                childRefs.delete(agentId)
                if (agentDir) removePid(agentDir)
                resolve()
                return
            }
            if (elapsed >= 5000) {
                clearInterval(interval)
                try {
                    process.kill(pid, 'SIGKILL')
                } catch {}
                childRefs.delete(agentId)
                if (agentDir) removePid(agentDir)
                resolve()
            }
        }, 200)
    })
}

const restartGateway = async (
    agentId: string,
    agentDir: string,
    port: number,
    version: string,
    token: string
): Promise<void> => {
    await stopGateway(agentId)
    await startGateway(agentId, agentDir, port, version, token)
}

const isRunning = (agentId: string): boolean => {
    const pid = childRefs.get(agentId)
    if (pid && isPidAlive(pid)) return true

    const agent = configStore.findAgent(agentId)
    if (!agent) return false
    const agentDir = configStore.getAgentDir(agent.name)
    const filePid = readPid(agentDir)
    if (filePid && isPidAlive(filePid)) {
        childRefs.set(agentId, filePid)
        return true
    }

    childRefs.delete(agentId)
    if (filePid) removePid(agentDir)
    return false
}

const getProcessInfo = (agentId: string): { pid: number } | null => {
    if (!isRunning(agentId)) return null
    const pid = childRefs.get(agentId)
    return pid ? { pid } : null
}

const getLogs = (agentDir: string, lines: number = 100): string => {
    const logPath = path.join(agentDir, 'gateway.log')
    if (!fs.existsSync(logPath)) return ''
    const content = fs.readFileSync(logPath, 'utf-8')
    const allLines = content.split('\n')
    return allLines.slice(-lines).join('\n')
}

const stopAll = async (): Promise<void> => {
    const config = configStore.readConfig()
    const stopPromises = config.agents.map((agent) => stopGateway(agent.id))
    await Promise.all(stopPromises)
}

const cleanOrphanedProcesses = (): void => {
    const config = configStore.readConfig()
    const agentNames = new Set(config.agents.map((c) => c.name))
    const agentsDir = path.join(configStore.getBaseDir(), 'agents')
    if (!fs.existsSync(agentsDir)) return
    for (const dir of fs.readdirSync(agentsDir)) {
        if (agentNames.has(dir)) continue
        const pidPath = path.join(agentsDir, dir, 'gateway.pid')
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