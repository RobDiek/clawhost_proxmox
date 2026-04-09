import type { Context } from 'hono'
import type {
    GithubEmailEntry,
    GithubUserResponse,
    GoogleUserinfoResponse,
    ResolveCredentialConflictBody
} from '@/ts/Interfaces'

import { eq, sql } from 'drizzle-orm'
import { authMethod, externalUrls } from '@openclaw/shared'
import { auth } from '@/services/firebase'
import { db } from '@/db'
import { users } from '@/db/schema'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const verifyGithubToken = async (accessToken: string) => {
    const [userRes, emailsRes] = await Promise.all([
        fetch(externalUrls.GITHUB.USER, {
            headers: { Authorization: `Bearer ${accessToken}` }
        }),
        fetch(externalUrls.GITHUB.USER_EMAILS, {
            headers: { Authorization: `Bearer ${accessToken}` }
        })
    ])

    if (!userRes.ok) return null

    const userData = (await userRes.json()) as GithubUserResponse
    const providerUid = String(userData.id)
    const displayName = userData.name || userData.login
    let email = userData.email

    if (!email && emailsRes.ok) {
        const emails = (await emailsRes.json()) as GithubEmailEntry[]
        const primary = emails.find((e: GithubEmailEntry) => e.primary)
        email = primary?.email
    }

    return { email, providerUid, displayName }
}

const verifyGoogleToken = async (accessToken: string) => {
    const res = await fetch(externalUrls.GOOGLE.USERINFO, {
        headers: { Authorization: `Bearer ${accessToken}` }
    })

    if (!res.ok) return null

    const data = (await res.json()) as GoogleUserinfoResponse
    return {
        email: data.email,
        providerUid: data.sub,
        displayName: data.name
    }
}

const resolveCredentialConflict = withErrorHandler('resolveCredentialConflict')(
    async (c: Context) => {
        const { accessToken, providerId } =
            await c.req.json<ResolveCredentialConflictBody>()

        if (!accessToken || !providerId)
            return fail(c, t('api.missingRequiredFields'), 400)

        const verifier =
            providerId === 'github.com' ? verifyGithubToken : verifyGoogleToken
        const verified = await verifier(accessToken)

        if (!verified?.email) return fail(c, t('api.invalidCredentials'), 401)

        const existingUser = await db
            .select()
            .from(users)
            .where(eq(users.email, verified.email.toLowerCase()))
            .limit(1)
            .then((rows) => rows[0])

        if (!existingUser) return fail(c, t('api.userNotFound'), 404)

        const method =
            providerId === 'google.com' ? authMethod.google : authMethod.github
        await Promise.all([
            auth()
                .updateUser(existingUser.id, {
                    providerToLink: {
                        providerId,
                        uid: verified.providerUid,
                        email: verified.email,
                        displayName: verified.displayName
                    }
                })
                .catch(() => {}),
            db
                .update(users)
                .set({
                    authMethods: sql`CASE
                    WHEN ${method} = ANY(COALESCE(${users.authMethods}, '{}'))
                    THEN COALESCE(${users.authMethods}, '{}')
                    ELSE array_append(COALESCE(${users.authMethods}, '{}'), ${method})
                END`
                })
                .where(eq(users.id, existingUser.id))
        ])

        const customToken = await auth().createCustomToken(existingUser.id)
        return ok(c, { customToken }, t('api.accountLinked'))
    }
)

export default resolveCredentialConflict