import type { ChannelConfig, UpdateClawChannelsBody } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import { versionGatedFeature } from '@openclaw/shared'
import executeSSH from '@/services/ssh'
import {
    applyToolsDefaults,
    BASE_DIR,
    findUserClaw,
    checkFeatureVersion,
    parseJsonFromSSH,
    writeConfigAndRestart
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

        const claw = await findUserClaw(userId, id, c.get('isAdmin'))

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
                versionGatedFeature.channels
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

            const config = parseJsonFromSSH(output)

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

            await writeConfigAndRestart(claw.ip, claw.rootPassword, config)

            return ok(c, null, t('api.channelsUpdated'))
        } catch {
            return fail(c, t('api.channelsUpdateFailed'), 500)
        }
    } catch {
        return fail(c, t('api.channelsUpdateFailed'), 500)
    }
}

export default updateClawChannels