import type { AuthenticatedContext } from '@/ts/Types'
import type {
    InstallVersionBody,
    NpmRegistryTimeResponse
} from '@/ts/Interfaces'

import { eq } from 'drizzle-orm'
import { externalUrls } from '@openclaw/shared'
import { db } from '@/db'
import { agents } from '@/db/schema'
import executeSSH from '@/services/ssh'
import {
    invalidateVersionCache,
    getAgentConfig,
    DOMAIN
} from '@/controllers/agents/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const VERSION_REGEX = /^[a-zA-Z0-9._-]+$/
const OUTDATED_CUTOFF = new Date('2026-02-01')

const installAgentVersion = async (c: AuthenticatedContext) => {
    try {
        const id = c.req.param('id')!
        const { version } = await c.req.json<InstallVersionBody>()

        if (!version || !VERSION_REGEX.test(version))
            return fail(c, t('api.invalidVersion'), 400)

        const [agentResult] = await Promise.all([
            db.select().from(agents).where(eq(agents.id, id)).limit(1)
        ])

        const agent = agentResult

        if (!agent[0]) return fail(c, t('api.clawNotFound'), 404)

        if (!agent[0].ip || !agent[0].rootPassword)
            return fail(c, t('api.failedToInstallVersion'), 400)

        const agentConfig = getAgentConfig(agent[0].agentType)

        if (!agentConfig.npmPackage)
            return fail(c, t('api.failedToInstallVersion'), 400)

        const registryUrl = externalUrls.NPM.REGISTRY(agentConfig.npmPackage)
        const registryResponse = await fetch(registryUrl, {
            headers: { Accept: 'application/json' }
        })

        if (registryResponse.ok) {
            const registry =
                (await registryResponse.json()) as NpmRegistryTimeResponse
            const publishedAt = registry.time?.[version]
            if (publishedAt && new Date(publishedAt) < OUTDATED_CUTOFF)
                return fail(c, t('api.outdatedVersion'), 400)
        }

        const nginxPatch = `(grep -q 'proxy_hide_header Content-Security-Policy' /etc/nginx/sites-available/${agentConfig.nginxSite} || sed -i 's|proxy_send_timeout 86400;|proxy_send_timeout 86400;\\n            proxy_hide_header Content-Security-Policy;\\n            proxy_hide_header X-Frame-Options;\\n            add_header Content-Security-Policy "frame-ancestors https://${DOMAIN} https://*.${DOMAIN} http://localhost:* https://localhost:*" always;|g' /etc/nginx/sites-available/${agentConfig.nginxSite}) && nginx -t && systemctl reload nginx || true`

        const installCommands = [
            `systemctl stop ${agentConfig.serviceName} || true`,
            `npm install -g ${agentConfig.npmPackage}@${version}`,
            ...(agentConfig.doctorCommand
                ? [
                      `su - ${agentConfig.user} -c "${agentConfig.doctorCommand}" || true`
                  ]
                : []),
            nginxPatch,
            `systemctl restart ${agentConfig.serviceName}`,
            'sleep 15',
            'curl -sf -o /dev/null --max-time 5 http://127.0.0.1:18789 && echo "GATEWAY_OK" || echo "GATEWAY_FAILED"'
        ].join(' && ')

        const output = await executeSSH(
            agent[0].ip,
            agent[0].rootPassword,
            installCommands,
            120000
        )

        invalidateVersionCache(agent[0].ip)

        const success = output.includes('GATEWAY_OK')

        if (success) return ok(c, { version }, t('api.installVersionSuccess'))

        return fail(c, t('api.failedToInstallVersion'), 500)
    } catch (error) {
        console.error('installAgentVersion', error)
        return fail(c, t('api.failedToInstallVersion'), 500)
    }
}

export default installAgentVersion