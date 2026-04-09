import type { ChannelConfig, UpdateClawChannelsBody } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import { versionGatedFeature } from '@openclaw/shared'
import {
    findUserClaw,
    SUPPORTED_CHANNELS,
    withFeatureGatedConfigUpdate
} from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const CHANNEL_REQUIRED_FIELDS: Record<string, string[]> = {
    telegram: ['botToken'],
    discord: ['token'],
    slack: ['botToken', 'appToken'],
    signal: ['account']
}

const DEPRECATED_CHANNEL_KEYS = ['applicationId']

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

const updateClawChannels = withErrorHandler(
    'updateClawChannels',
    'api.channelsUpdateFailed'
)(async (c: AuthenticatedContext) => {
    const userId = c.get('userId')
    const id = c.req.param('id')!
    const body = await c.req.json<UpdateClawChannelsBody>()

    if (!body.channels || typeof body.channels !== 'object')
        return fail(c, t('api.missingRequiredFields'), 400)

    for (const [channelKey, channelConfig] of Object.entries(body.channels)) {
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

    if (!claw) return fail(c, t('api.clawNotFound'), 404)

    if (!claw.ip || !claw.rootPassword)
        return fail(c, t('api.channelsUpdateFailed'), 400)

    try {
        const result = await withFeatureGatedConfigUpdate({
            ip: claw.ip,
            rootPassword: claw.rootPassword,
            feature: versionGatedFeature.channels,
            mutate: (config) => {
                config.channels = sanitizeChannels(body.channels)
            }
        })

        if (!result.ok) {
            return fail(
                c,
                t('api.featureVersionUnsupported', {
                    version: result.unsupportedVersion!
                }),
                400,
                { version: result.unsupportedVersion }
            )
        }

        return ok(c, null, t('api.channelsUpdated'))
    } catch {
        return fail(c, t('api.channelsUpdateFailed'), 500)
    }
})

export default updateClawChannels