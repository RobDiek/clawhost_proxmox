import type { AuthenticatedContext } from '@/ts/Types'

import { findUserClaw } from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import { browseSkills } from '@/services/clawhub'

const browseClawHubSkills = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!

        const claw = await findUserClaw(userId, id)

        if (!claw) {
            return fail(c, t('api.clawNotFound'), 404)
        }

        const result = await browseSkills({
            query: c.req.query('query') || undefined,
            limit: c.req.query('limit')
                ? Number(c.req.query('limit'))
                : undefined,
            cursor: c.req.query('cursor') || undefined
        })

        return ok(
            c,
            {
                skills: result.skills,
                nextCursor: result.nextCursor,
                hasMore: result.hasMore
            },
            t('api.clawHubSearchSuccess')
        )
    } catch {
        return fail(c, t('api.clawHubSearchFailed'), 500)
    }
}

export default browseClawHubSkills