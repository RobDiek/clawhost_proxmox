import type {
    InstallVersionBody,
    NpmRegistryTimeResponse
} from '@/ts/Interfaces'

import { externalUrls } from '@openclaw/shared'
import executeSSH from '@/services/ssh'
import {
    invalidateVersionCache,
    getAgentConfig,
    DOMAIN,
    withAgent
} from '@/controllers/agents/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import { gatewayDefaults } from '@/lib/constants'

const VERSION_REGEX = /^[a-zA-Z0-9._-]+$/
const OUTDATED_CUTOFF = new Date('2026-02-01')

const buildNpmInstallCommands = async (
    version: string,
    npmPackage: string,
    serviceName: string,
    user: string,
    doctorCommand: string | null,
    nginxSite: string
): Promise<string> => {
    const registryUrl = externalUrls.NPM.REGISTRY(npmPackage)
    const registryResponse = await fetch(registryUrl, {
        headers: { Accept: 'application/json' }
    })

    if (registryResponse.ok) {
        const registry =
            (await registryResponse.json()) as NpmRegistryTimeResponse
        const publishedAt = registry.time?.[version]
        if (publishedAt && new Date(publishedAt) < OUTDATED_CUTOFF)
            throw new Error('outdated_version')
    }

    const nginxPatch = `(grep -q 'proxy_hide_header Content-Security-Policy' /etc/nginx/sites-available/${nginxSite} || sed -i 's|proxy_send_timeout 86400;|proxy_send_timeout 86400;\\n            proxy_hide_header Content-Security-Policy;\\n            proxy_hide_header X-Frame-Options;\\n            add_header Content-Security-Policy "frame-ancestors https://${DOMAIN} https://*.${DOMAIN} http://localhost:* https://localhost:*" always;|g' /etc/nginx/sites-available/${nginxSite}) && nginx -t && systemctl reload nginx || true`

    return [
        `systemctl stop ${serviceName} || true`,
        `npm install -g ${npmPackage}@${version}`,
        ...(doctorCommand
            ? [`su - ${user} -c "${doctorCommand}" || true`]
            : []),
        nginxPatch,
        `systemctl restart ${serviceName}`,
        'sleep 15',
        `curl -sf -o /dev/null --max-time 5 ${gatewayDefaults.BASE_URL} && echo "GATEWAY_OK" || echo "GATEWAY_FAILED"`
    ].join(' && ')
}

const buildGitHubInstallCommands = (
    version: string,
    githubRepo: string,
    serviceName: string,
    user: string,
    versionCommand: string
): string => {
    return [
        `systemctl stop ${serviceName} 2>/dev/null || true`,
        `su - ${user} -c 'curl -fsSL https://raw.githubusercontent.com/${githubRepo}/main/scripts/install.sh | HERMES_VERSION=${version} bash -s -- --skip-setup'`,
        `systemctl restart ${serviceName} 2>/dev/null || su - ${user} -c 'systemctl --user restart ${serviceName}' 2>/dev/null || true`,
        'sleep 5',
        `su - ${user} -c '${versionCommand}' >/dev/null 2>&1 && echo "GATEWAY_OK" || echo "GATEWAY_FAILED"`
    ].join(' && ')
}

const installAgentVersion = withAgent({
    requireSSH: 'api.failedToInstallVersion'
})(async (c, agent) => {
    try {
        const { version } = await c.req.json<InstallVersionBody>()

        if (!version || !VERSION_REGEX.test(version))
            return fail(c, t('api.invalidVersion'), 400)

        const agentConfig = getAgentConfig(agent.agentType)

        let installCommands: string

        if (agentConfig.githubRepo) {
            installCommands = buildGitHubInstallCommands(
                version,
                agentConfig.githubRepo,
                agentConfig.serviceName,
                agentConfig.user,
                agentConfig.versionCommand
            )
        } else if (agentConfig.npmPackage) {
            try {
                installCommands = await buildNpmInstallCommands(
                    version,
                    agentConfig.npmPackage,
                    agentConfig.serviceName,
                    agentConfig.user,
                    agentConfig.doctorCommand,
                    agentConfig.nginxSite
                )
            } catch (error) {
                if (
                    error instanceof Error &&
                    error.message === 'outdated_version'
                )
                    return fail(c, t('api.outdatedVersion'), 400)
                throw error
            }
        } else {
            console.error(
                'installAgentVersion',
                new Error(
                    `agent ${agent.id} type ${agent.agentType} has no githubRepo or npmPackage configured`
                )
            )
            return fail(c, t('api.failedToInstallVersion'), 400)
        }

        let output: string
        try {
            output = await executeSSH(
                agent.ip!,
                agent.rootPassword!,
                installCommands,
                120000
            )
        } catch (sshError) {
            console.error('installAgentVersion', sshError)
            return fail(c, t('api.failedToInstallVersion'), 500)
        }

        invalidateVersionCache(agent.ip!)

        const success = output.includes('GATEWAY_OK')

        if (success) return ok(c, { version }, t('api.installVersionSuccess'))

        console.error(
            'installAgentVersion',
            new Error(
                `agent ${agent.id} version ${version} install did not reach GATEWAY_OK. Output tail:\n${output.slice(-2000)}`
            )
        )
        return fail(c, t('api.failedToInstallVersion'), 500)
    } catch (error) {
        console.error('installAgentVersion', error)
        return fail(c, t('api.failedToInstallVersion'), 500)
    }
})

export default installAgentVersion