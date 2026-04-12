import { withClaw } from '@/controllers/agents/helpers'
import { t } from '@openclaw/i18n'
import { externalUrls } from '@openclaw/shared'
import { ok, fail } from '@/lib/response'

const fetchJson = async (
    url: string,
    headers?: Record<string, string>
): Promise<unknown | null> => {
    try {
        const res = await fetch(url, {
            headers,
            signal: AbortSignal.timeout(5000)
        })
        if (!res.ok) return null
        return await res.json()
    } catch {
        return null
    }
}

const getClawOverview = withClaw()(async (c, claw) => {
    try {
        if (!claw.gatewayToken || !claw.subdomain)
            return fail(c, t('api.failedToGetOverview'), 400)

        const gatewayUrl = externalUrls.CLAWHOST.subdomain(claw.subdomain)
        const authHeader = { Authorization: `Bearer ${claw.gatewayToken}` }

        const [healthRaw, readyRaw, sessionsRaw] = await Promise.all([
            fetchJson(`${gatewayUrl}/healthz`),
            fetchJson(`${gatewayUrl}/readyz`),
            fetchJson(`${gatewayUrl}/api/sessions`, authHeader)
        ])

        const health =
            healthRaw && typeof healthRaw === 'object'
                ? (healthRaw as Record<string, unknown>)
                : null
        const ready =
            readyRaw && typeof readyRaw === 'object'
                ? (readyRaw as Record<string, unknown>)
                : null
        const sessions = Array.isArray(sessionsRaw) ? sessionsRaw : null

        const isLive = health?.ok === true
        const isReady = ready?.ready === true

        return ok(
            c,
            {
                gateway: {
                    active: isLive,
                    reachable: isLive,
                    portListening: isLive,
                    ready: isReady
                },
                instance: {
                    version: null,
                    model: null,
                    contextWindow: null,
                    activeSessions: sessions?.length ?? 0,
                    memory: null,
                    agents: null,
                    heartbeat: null,
                    events: null,
                    probes: null
                },
                config: null,
                sessions,
                apiStatus: health,
                timestamp: Date.now()
            },
            t('api.overviewFetched')
        )
    } catch (error) {
        console.error('getClawOverview', error)
        return fail(
            c,
            error instanceof Error
                ? error.message
                : t('api.failedToGetOverview'),
            500
        )
    }
})

export default getClawOverview