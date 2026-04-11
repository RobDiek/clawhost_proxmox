import type { AuthenticatedContext } from '@/ts/Types'

import { eq } from 'drizzle-orm'
import { inputValidation } from '@openclaw/shared'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const checkSubdomainAvailability = withErrorHandler(
    'checkSubdomainAvailability'
)(async (c: AuthenticatedContext) => {
    const subdomain = c.req.query('subdomain')?.trim().toLowerCase()

    if (!subdomain) return fail(c, t('api.invalidSubdomain'), 400)

    const subdomainRegex = new RegExp(
        `^[a-z0-9]{${inputValidation.SUBDOMAIN.MIN},${inputValidation.SUBDOMAIN.MAX}}$`
    )
    if (!subdomainRegex.test(subdomain))
        return fail(c, t('api.invalidSubdomain'), 400)

    const [existing] = await db
        .select({ id: claws.id })
        .from(claws)
        .where(eq(claws.subdomain, subdomain))
        .limit(1)

    return ok(c, { available: !existing })
})

export default checkSubdomainAvailability