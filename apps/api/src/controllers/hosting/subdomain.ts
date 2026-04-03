import type { Context } from 'hono'
import { eq, and, ne } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'

const RESERVED = ['www', 'api', 'admin', 'mail', 'ftp', 'test', 'dev', 'staging', 'status', 'blog', 'app', 'dashboard', 'support', 'help', 'openclaw', 'clawflow', 'flowmatic']
const SUBDOMAIN_REGEX = /^[a-z][a-z0-9-]{2,19}$/

export const checkSubdomain = async (c: Context) => {
    try {
        const name = c.req.query('name')?.toLowerCase().trim()

        if (!name) {
            return fail(c, 'Name is required.', 400)
        }

        if (!SUBDOMAIN_REGEX.test(name)) {
            return fail(c, 'Name must be 3-20 characters, lowercase letters, numbers and hyphens. Must start with a letter.', 400)
        }

        if (RESERVED.includes(name)) {
            return ok(c, { available: false, reason: 'reserved' }, 'Name is reserved.')
        }

        // Only check ACTIVE instances — ignore awaiting_payment (abandoned checkouts)
        const existing = await db.select({ id: instances.id })
            .from(instances)
            .where(and(
                eq(instances.subdomainName, name),
                ne(instances.status, 'awaiting_payment')
            ))
            .limit(1)
            .then(rows => rows[0])

        if (existing) {
            return ok(c, { available: false, reason: 'taken' }, 'Name is taken.')
        }

        return ok(c, {
            available: true,
            urls: {
                agent: `${name}.clawflow.flowmatic.co.il`,
                flows: `${name}-flows.clawflow.flowmatic.co.il`
            }
        }, 'Name is available.')
    } catch (err) {
        console.error('checkSubdomain error:', err)
        return fail(c, 'Failed to check name.', 500)
    }
}
