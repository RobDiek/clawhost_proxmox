import 'dotenv/config'
import fs from 'fs'
import crypto from 'crypto'
import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { users, emails } from '@/db/schema'
import { getResend, FROM_EMAIL } from '@/services/resend'
import SimplifiedPlatformEmail from '@/emails/SimplifiedPlatformEmail'
import { featureEmailKey } from '@/lib/constants'
import { t } from '@openclaw/i18n'

const FEATURE_KEY = featureEmailKey.simplifiedPlatform
const BATCH_DELAY_MS = 300
const SUCCESS_FILE = 'send-success.txt'
const FAIL_FILE = 'send-fail.txt'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const run = async () => {
    const resend = getResend()

    fs.writeFileSync(SUCCESS_FILE, '')
    fs.writeFileSync(FAIL_FILE, '')

    const pendingUsers = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(
            sql`${users.id} NOT IN (
                SELECT ${emails.userId} FROM ${emails}
                WHERE ${emails.feature} = ${FEATURE_KEY}
            )`
        )

    const total = pendingUsers.length
    console.error('sendSimplifiedPlatformEmail', `Found ${total} users to email`)

    let sent = 0
    let failed = 0

    for (let i = 0; i < pendingUsers.length; i++) {
        const user = pendingUsers[i]
        const progress = `[${i + 1}/${total}]`

        try {
            await db.insert(emails).values({
                id: crypto.randomUUID(),
                userId: user.id,
                feature: FEATURE_KEY
            })

            const { error } = await resend.emails.send({
                from: FROM_EMAIL,
                to: user.email,
                subject: t('emails.features.simplifiedPlatform.subject'),
                react: SimplifiedPlatformEmail({})
            })

            if (error) {
                await db
                    .delete(emails)
                    .where(
                        sql`${emails.userId} = ${user.id} AND ${emails.feature} = ${FEATURE_KEY}`
                    )
                failed++
                fs.appendFileSync(FAIL_FILE, `${user.email}\n`)
                console.error('sendSimplifiedPlatformEmail', `${progress} FAIL ${user.email}`)
            } else {
                sent++
                fs.appendFileSync(SUCCESS_FILE, `${user.email}\n`)
                console.error('sendSimplifiedPlatformEmail', `${progress} OK ${user.email}`)
            }
        } catch (sendError) {
            failed++
            fs.appendFileSync(FAIL_FILE, `${user.email}\n`)
            console.error('sendSimplifiedPlatformEmail', `${progress} FAIL ${user.email}`, sendError)
        }

        await sleep(BATCH_DELAY_MS)
    }

    console.error('sendSimplifiedPlatformEmail', `Done. Sent: ${sent}, Failed: ${failed}`)
    console.error('sendSimplifiedPlatformEmail', `Success log: ${SUCCESS_FILE}`)
    console.error('sendSimplifiedPlatformEmail', `Fail log: ${FAIL_FILE}`)
    process.exit(0)
}

run()