import type { ClawBindingEntry, ClawBindingAgent } from '@/ts/Interfaces'

import {
    BASE_DIR,
    parseJsonFromSSH,
    readClawConfigFile,
    ClawMissingCredentialsError,
    withClaw
} from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const getClawBindings = withErrorHandler(
    'getClawBindings',
    'api.bindingsFetchFailed'
)(
    withClaw()(async (c, claw) => {
        try {
            const config = await readClawConfigFile(
                claw,
                `${BASE_DIR}/openclaw.json`,
                (raw) => parseJsonFromSSH(raw),
                { fallback: '{}' }
            )

            const bindings: ClawBindingEntry[] = Array.isArray(config?.bindings)
                ? (config.bindings as ClawBindingEntry[])
                : []
            const channels = (config?.channels || {}) as Record<string, unknown>
            const agentList = Array.isArray(
                (config?.agents as Record<string, unknown>)?.list
            )
                ? ((config.agents as Record<string, unknown>)
                      .list as ClawBindingAgent[])
                : []
            const agents = agentList.map((a: ClawBindingAgent) => ({
                id: a.id,
                name: a.name
            }))

            return ok(
                c,
                { bindings, channels, agents },
                t('api.bindingsFetched')
            )
        } catch (error) {
            if (error instanceof ClawMissingCredentialsError)
                return fail(c, t('api.bindingsFetchFailed'), 400)
            return fail(c, t('api.bindingsFetchFailed'), 500)
        }
    })
)

export default getClawBindings