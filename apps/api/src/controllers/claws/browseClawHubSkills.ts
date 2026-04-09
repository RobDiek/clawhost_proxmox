import { withClaw } from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok } from '@/lib/response'
import { browseSkills } from '@/services/clawhub'
import withErrorHandler from '@/lib/withErrorHandler'

const browseClawHubSkills = withErrorHandler(
    'browseClawHubSkills',
    'api.clawHubSearchFailed'
)(
    withClaw()(async (c) => {
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
    })
)

export default browseClawHubSkills