import 'dotenv/config'
import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users, emails } from '@/db/schema'
import { getResend, FROM_EMAIL } from '@/services/resend'
import FEATURE_EMAILS from '@/lib/featureEmails'

const BATCH_DELAY_MS = 200

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const run = async () => {
    const resend = getResend()
    const allUsers = await db
        .select({ id: users.id, email: users.email })
        .from(users)

    let totalSent = 0

    for (const user of allUsers) {
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

    console.error(`Done. Sent ${totalSent} feature emails.`)
    process.exit(0)
}

run().catch((err) => {
    console.error('Feature email script failed:', err)
    process.exit(1)
})