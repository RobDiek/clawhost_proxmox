import type { Context } from 'hono'
import type { FeatureEmailKey } from '@/ts/Types'

import crypto from 'crypto'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { users, emails } from '@/db/schema'
import { getResend, FROM_EMAIL } from '@/services/resend'
import FEATURE_EMAILS from '@/lib/featureEmails'
import { ok, fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

const BATCH_SIZE = 5
const BATCH_DELAY_MS = 200
const FEATURE_COUNT = FEATURE_EMAILS.length

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const sendFeatureEmails = async (c: Context) => {
    try {
        const featureParam = c.req.query('feature') as FeatureEmailKey | undefined
        const batchParam = c.req.query('batch')
        const batchSize = batchParam ? Math.min(parseInt(batchParam, 10), 50) : BATCH_SIZE
        const resend = getResend()

        if (featureParam) {
            const targetFeature = FEATURE_EMAILS.find((f) => f.key === featureParam)
            if (!targetFeature) {
                return fail(c, t('api.invalidFeatureKey'), 400)
            }

            const pendingUsers = await db
                .select({ id: users.id, email: users.email })
                .from(users)
                .where(
                    sql`${users.id} NOT IN (
                        SELECT ${emails.userId} FROM ${emails}
                        WHERE ${emails.feature} = ${featureParam}
                    )`
                )
                .limit(batchSize)

            let totalSent = 0

            for (const user of pendingUsers) {
                const { error } = await resend.emails.send({
                    from: FROM_EMAIL,
                    to: user.email,
                    subject: targetFeature.subject,
                    react: targetFeature.render()
                })

                if (error) {
                    console.error(`Failed to send to ${user.email}:`, error)
                    continue
                }

                await db.insert(emails).values({
                    id: crypto.randomUUID(),
                    userId: user.id,
                    feature: targetFeature.key
                })

                totalSent++
                await sleep(BATCH_DELAY_MS)
            }

            return ok(c, {
                feature: featureParam,
                sent: totalSent,
                done: pendingUsers.length < batchSize
            }, t('api.featureEmailsSent'))
        }

        const pendingUsers = await db
            .select({ id: users.id, email: users.email })
            .from(users)
            .where(
                sql`(
                    SELECT COUNT(*) FROM ${emails}
                    WHERE ${emails.userId} = ${users.id}
                ) < ${FEATURE_COUNT}`
            )
            .limit(batchSize)

        let totalSent = 0

        for (const user of pendingUsers) {
            const sentEmails = await db
                .select({ feature: emails.feature })
                .from(emails)
                .where(eq(emails.userId, user.id))

            const sentFeatures = new Set(sentEmails.map((e) => e.feature))

            const nextFeature = FEATURE_EMAILS.find((f) => !sentFeatures.has(f.key))
            if (!nextFeature) continue

            const { error } = await resend.emails.send({
                from: FROM_EMAIL,
                to: user.email,
                subject: nextFeature.subject,
                react: nextFeature.render()
            })

            if (error) {
                console.error(`Failed to send to ${user.email}:`, error)
                continue
            }

            await db.insert(emails).values({
                id: crypto.randomUUID(),
                userId: user.id,
                feature: nextFeature.key
            })

            totalSent++
            await sleep(BATCH_DELAY_MS)
        }

        return ok(c, {
            sent: totalSent,
            done: pendingUsers.length < batchSize
        }, t('api.featureEmailsSent'))
    } catch {
        return fail(c, t('api.featureEmailsFailed'), 500)
    }
}

export default sendFeatureEmails