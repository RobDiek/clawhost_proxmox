import type { WithClawOptions } from '@/ts/Interfaces'
import type { AuthenticatedContext, ClawRow } from '@/ts/Types'
import type { TranslationKey } from '@openclaw/i18n'

import { t } from '@openclaw/i18n'
import { fail } from '@/lib/response'
import findUserClaw from '@/controllers/claws/helpers/findUserClaw'

const withClaw = (options: WithClawOptions = {}) => {
    return <R>(
        handler: (c: AuthenticatedContext, claw: ClawRow) => Promise<R>
    ) => {
        return async (c: AuthenticatedContext) => {
            const userId = c.get('userId')
            const id = c.req.param('id')!
            const claw = await findUserClaw(userId, id, c.get('isAdmin'))

            if (!claw) return fail(c, t('api.clawNotFound'), 404)

            if (options.requireSSH) {
                if (!claw.ip || !claw.rootPassword) {
                    const key: TranslationKey =
                        typeof options.requireSSH === 'string'
                            ? options.requireSSH
                            : 'api.clawNotFound'
                    return fail(c, t(key), 400)
                }
            }

            return handler(c, claw)
        }
    }
}

export default withClaw