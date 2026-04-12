import { withClaw } from '@/controllers/agents/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import executeSSH from '@/services/ssh'

const SEPARATOR = '---CLAWHOST_OVERVIEW_SEP---'

const tryParseJson = (raw: string): unknown | null => {
    try {
        return JSON.parse(raw.trim())
    } catch {
        return null
    }
}

const parseStatusTable = (raw: string): Record<string, string> => {
    const result: Record<string, string> = {}
    for (const line of raw.split('\n')) {
        const match = line.match(/\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|/)
        if (!match || !match[1] || !match[2]) continue
        const key = match[1].trim().toLowerCase().replace(/\s+/g, '_')
        if (key && !key.startsWith('─') && !key.startsWith('━'))
            result[key] = match[2].trim()
    }
    return result
}

const parseInstance = (table: Record<string, string>) => {
    const sessionsRaw = table.sessions || ''
    const activeMatch = sessionsRaw.match(/(\d+)\s*active/)
    const modelMatch = sessionsRaw.match(
        /default\s+([\w.-]+)\s*\((\d+k?)\s*ctx\)/
    )

    return {
        version: table.version || null,
        model: modelMatch ? modelMatch[1] : null,
        contextWindow: modelMatch ? modelMatch[2] : null,
        activeSessions: activeMatch ? parseInt(activeMatch[1], 10) : 0,
        memory: table.memory || null,
        agents: table.agents || null,
        heartbeat: table.heartbeat || null,
        events: table.events || null,
        probes: table.probes || null
    }
}

const parseConfig = (raw: unknown) => {
    if (!raw || typeof raw !== 'object') return null
    const obj = raw as Record<string, unknown>
    const browser = obj.browser as Record<string, unknown> | undefined
    const commands = obj.commands as Record<string, unknown> | undefined
    const tools = obj.tools as Record<string, unknown> | undefined

    const toolList: string[] = tools
        ? Object.entries(tools)
              .filter(([, v]) => v !== null && v !== undefined && v !== false)
              .map(([k]) => k)
        : []

    return {
        browserEnabled: !!browser?.enabled,
        commandsEnabled: !!commands?.bash,
        tools: toolList
    }
}

const getClawOverview = withClaw({
    requireSSH: 'api.failedToGetOverview'
})(async (c, claw) => {
    try {
        if (!claw.gatewayToken)
            return fail(c, t('api.failedToGetOverview'), 400)

        const tokenBase64 = Buffer.from(claw.gatewayToken).toString('base64')

        const command = [
            `TOKEN=$(echo '${tokenBase64}' | base64 -d)`,
            `curl -s http://127.0.0.1:18789/api/status 2>/dev/null || echo 'null'`,
            `echo '${SEPARATOR}'`,
            `curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:18789/api/sessions 2>/dev/null || echo 'null'`,
            `echo '${SEPARATOR}'`,
            "cat /home/openclaw/.openclaw/openclaw.json 2>/dev/null || echo 'null'",
            `echo '${SEPARATOR}'`,
            'systemctl is-active openclaw-gateway 2>/dev/null || echo inactive',
            `echo '${SEPARATOR}'`,
            'ss -tlnp 2>/dev/null | grep 18789 || echo ""',
            `echo '${SEPARATOR}'`,
            "su - openclaw -c 'openclaw status 2>/dev/null' 2>/dev/null || echo ''"
        ].join('; ')

        const output = await executeSSH(
            claw.ip!,
            claw.rootPassword!,
            command,
            20000
        )
        const parts = output.split(SEPARATOR)

        const apiStatus = tryParseJson(parts[0] || '')
        const apiSessions = tryParseJson(parts[1] || '')
        const configRaw = tryParseJson(parts[2] || '')
        const serviceState = (parts[3] || '').trim()
        const portListening = (parts[4] || '').trim().length > 0
        const cliOutput = (parts[5] || '').trim()

        const statusTable = cliOutput ? parseStatusTable(cliOutput) : {}
        const instance = parseInstance(statusTable)
        const config = parseConfig(configRaw)
        const sessions = Array.isArray(apiSessions) ? apiSessions : null
        const gatewayActive = serviceState === 'active'
        const apiReachable = apiStatus !== null && typeof apiStatus === 'object'

        return ok(
            c,
            {
                gateway: {
                    active: gatewayActive,
                    reachable: apiReachable,
                    portListening,
                    ready: gatewayActive && portListening
                },
                instance,
                config,
                sessions,
                apiStatus: apiReachable
                    ? (apiStatus as Record<string, unknown>)
                    : null,
                timestamp: Date.now()
            },
            t('api.overviewFetched')
        )
    } catch (error) {
        console.error('getClawOverview', error)
        return fail(c, t('api.failedToGetOverview'), 500)
    }
})

export default getClawOverview