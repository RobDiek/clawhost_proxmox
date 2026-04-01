import type { ChannelConfig, UpdateClawChannelsBody } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import executeSSH from '@/services/ssh'
import {
    applyToolsDefaults,
    BASE_DIR,
    findUserClaw,
    checkFeatureVersion
} from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const CHANNEL_REQUIRED_FIELDS: Record<string, string[]> = {
    telegram: ['botToken'],
    discord: ['token'],
    slack: ['botToken', 'appToken'],
    signal: ['account']
}

const DEPRECATED_CHANNEL_KEYS = ['applicationId']

const SUPPORTED_CHANNELS = new Set([
    'whatsapp',
    'telegram',
    'discord',
    'slack',
    'signal'
])

const sanitizeChannels = (
    channels: Record<string, ChannelConfig>
): Record<string, ChannelConfig> => {
    const cleaned: Record<string, ChannelConfig> = {}

    for (const [channelKey, channelConfig] of Object.entries(channels)) {
        if (!SUPPORTED_CHANNELS.has(channelKey)) continue
        const sanitized = { ...channelConfig } as unknown as Record<
            string,
            unknown
        >
        for (const key of DEPRECATED_CHANNEL_KEYS) {
            delete sanitized[key]
        }
        cleaned[channelKey] = sanitized as unknown as ChannelConfig
    }

    return cleaned
}

const updateClawChannels = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const body = await c.req.json<UpdateClawChannelsBody>()

        if (!body.channels || typeof body.channels !== 'object') {
            return fail(c, t('api.missingRequiredFields'), 400)
        }

        for (const [channelKey, channelConfig] of Object.entries(
            body.channels
        )) {
            if (!channelConfig.enabled) continue
            const required = CHANNEL_REQUIRED_FIELDS[channelKey]
            if (!required) continue
            for (const field of required) {
                const value = channelConfig[field as keyof typeof channelConfig]
                if (!value || (typeof value === 'string' && !value.trim())) {
                    return fail(c, t('api.channelMissingRequired'), 400)
                }
            }
        }

        const claw = await findUserClaw(userId, id)

        if (!claw) {
            return fail(c, t('api.clawNotFound'), 404)
        }

        if (!claw.ip || !claw.rootPassword) {
            return fail(c, t('api.channelsUpdateFailed'), 400)
        }

        try {
            const { supported, version } = await checkFeatureVersion(
                claw.ip,
                claw.rootPassword,
                'channels'
            )

            if (!supported) {
                return fail(
                    c,
                    t('api.featureVersionUnsupported', { version }),
                    400,
                    { version }
                )
            }

            const output = await executeSSH(
                claw.ip,
                claw.rootPassword,
                `cat ${BASE_DIR}/openclaw.json 2>/dev/null || echo '{}'`,
                5000
            )

            let config: Record<string, unknown> = {}
            try {
                const trimmed = output.trim()
                const jsonStart = trimmed.indexOf('{')
                const jsonEnd = trimmed.lastIndexOf('}')
                const jsonStr =
                    jsonStart >= 0 && jsonEnd > jsonStart
                        ? trimmed.substring(jsonStart, jsonEnd + 1)
                        : '{}'
                config = JSON.parse(jsonStr)
            } catch {
                config = {}
            }

            applyToolsDefaults(config)

            const agents = (config.agents || {
                defaults: {},
                list: []
            }) as Record<string, unknown>
            const defaults = (agents.defaults || {}) as Record<string, unknown>
            defaults.sandbox = { mode: 'off' }
            agents.defaults = defaults
            config.agents = agents

            config.channels = sanitizeChannels(body.channels)

            const configJson = JSON.stringify(config, null, 4)
            const configB64 = Buffer.from(configJson).toString('base64')

            await executeSSH(
                claw.ip,
                claw.rootPassword,
                `echo '${configB64}' | base64 -d > ${BASE_DIR}/openclaw.json && (su - openclaw -c "openclaw doctor --fix" || true) && systemctl restart openclaw-gateway`,
                20000
            )

            return ok(c, null, t('api.channelsUpdated'))
        } catch {
            return fail(c, t('api.channelsUpdateFailed'), 500)
        }
    } catch {
        return fail(c, t('api.channelsUpdateFailed'), 500)
    }
}

export default updateClawChannels