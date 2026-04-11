import { withClaw } from '@/controllers/agents/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import executeSSH from '@/services/ssh'

const SEPARATOR = '---CLAWHOST_METRICS_SEP---'

const parseMemory = (raw: string) => {
    const lines = raw.trim().split('\n')
    const memLine = lines.find((l) => l.startsWith('Mem:'))
    if (!memLine) return { total: 0, used: 0, available: 0 }
    const parts = memLine.split(/\s+/)
    return {
        total: parseInt(parts[1] || '0', 10),
        used: parseInt(parts[2] || '0', 10),
        available: parseInt(parts[6] || '0', 10)
    }
}

const parseDisk = (raw: string) => {
    const lines = raw.trim().split('\n')
    const dataLine = lines.find((l) => l.startsWith('/')) || lines[lines.length - 1]
    if (!dataLine) return { total: 0, used: 0, available: 0, usagePercent: 0 }
    const parts = dataLine.split(/\s+/)
    return {
        total: parseInt(parts[1] || '0', 10),
        used: parseInt(parts[2] || '0', 10),
        available: parseInt(parts[3] || '0', 10),
        usagePercent: parseInt((parts[4] || '0').replace('%', ''), 10)
    }
}

const parseCpu = (raw: string, coresRaw: string) => {
    const idleMatch = raw.match(/(\d+\.?\d*)\s*id/)
    if (!idleMatch) return { usagePercent: 0, cores: 1 }
    const idle = parseFloat(idleMatch[1])
    const cores = parseInt(coresRaw.trim(), 10)
    return {
        usagePercent: Math.round((100 - idle) * 10) / 10,
        cores: isNaN(cores) ? 1 : cores
    }
}

const parseLoadAvg = (raw: string) => {
    const parts = raw.trim().split(/\s+/)
    return {
        load1: parseFloat(parts[0] || '0'),
        load5: parseFloat(parts[1] || '0'),
        load15: parseFloat(parts[2] || '0')
    }
}

const parseNetwork = (raw: string) => {
    const lines = raw.trim().split('\n')
    const eth0Line = lines.find(
        (l) => l.includes('eth0:') || l.includes('ens')
    )
    if (!eth0Line) return { rxBytes: 0, txBytes: 0, interface: 'eth0' }
    const parts = eth0Line.split(/[:\s]+/).filter(Boolean)
    const ifaceIdx = parts.findIndex(
        (p) => p === 'eth0' || p.startsWith('ens')
    )
    return {
        rxBytes: parseInt(parts[ifaceIdx + 1] || '0', 10),
        txBytes: parseInt(parts[ifaceIdx + 9] || '0', 10),
        interface: parts[ifaceIdx] || 'eth0'
    }
}

const parseProcesses = (raw: string) => {
    const lines = raw.trim().split('\n')
    return lines
        .filter((l) => l.trim().length > 0)
        .map((line) => {
            const parts = line.split(/\s+/)
            return {
                pid: parseInt(parts[0] || '0', 10),
                user: parts[1] || '',
                cpu: parseFloat(parts[2] || '0'),
                mem: parseFloat(parts[3] || '0'),
                command: parts.slice(4).join(' ')
            }
        })
        .slice(0, 10)
}

const parseUptime = (raw: string) => {
    const match = raw.match(/up\s+(.+?),\s+\d+\s+user/)
    return match ? match[1].trim() : raw.trim()
}

const getClawMetrics = withClaw({ requireSSH: 'api.failedToGetMetrics' })(
    async (c, claw) => {
        try {
            const command = [
                "top -bn1 | head -5 | grep '%Cpu\\|Tasks'",
                `echo '${SEPARATOR}'`,
                'free -b 2>&1',
                `echo '${SEPARATOR}'`,
                'df -B1 / 2>&1',
                `echo '${SEPARATOR}'`,
                'cat /proc/loadavg 2>&1',
                `echo '${SEPARATOR}'`,
                'cat /proc/net/dev 2>&1',
                `echo '${SEPARATOR}'`,
                'ps aux --sort=-%cpu --no-headers | head -10 2>&1',
                `echo '${SEPARATOR}'`,
                'uptime 2>&1',
                `echo '${SEPARATOR}'`,
                'nproc 2>&1'
            ].join('; ')

            const output = await executeSSH(claw.ip!, claw.rootPassword!, command)
            const parts = output.split(SEPARATOR)

            return ok(c, {
                cpu: parseCpu(parts[0] || '', parts[7] || ''),
                memory: parseMemory(parts[1] || ''),
                disk: parseDisk(parts[2] || ''),
                loadAvg: parseLoadAvg(parts[3] || ''),
                network: parseNetwork(parts[4] || ''),
                processes: parseProcesses(parts[5] || ''),
                uptime: parseUptime(parts[6] || ''),
                timestamp: Date.now()
            }, t('api.metricsFetched'))
        } catch (error) {
            console.error('getClawMetrics', error)
            return fail(
                c,
                error instanceof Error
                    ? error.message
                    : t('api.failedToGetMetrics'),
                500
            )
        }
    }
)

export default getClawMetrics