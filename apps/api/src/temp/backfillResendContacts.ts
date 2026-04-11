import 'dotenv/config'
import fs from 'fs'
import { db } from '@/db'
import { users } from '@/db/schema'
import { getResend } from '@/services/resend'

const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID
const BATCH_DELAY_MS = 200
const SUCCESS_FILE = 'backfill-success.txt'
const FAIL_FILE = 'backfill-fail.txt'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const run = async () => {
    if (!AUDIENCE_ID) {
        console.error('backfillResendContacts', 'Missing RESEND_AUDIENCE_ID')
        process.exit(1)
    }

    const resend = getResend()

    fs.writeFileSync(SUCCESS_FILE, '')
    fs.writeFileSync(FAIL_FILE, '')

    const allUsers = await db
        .select({ email: users.email, name: users.name })
        .from(users)

    const total = allUsers.length
    console.error('backfillResendContacts', `Found ${total} users to backfill`)

    let success = 0
    let failed = 0

    for (let i = 0; i < allUsers.length; i++) {
        const user = allUsers[i]
        const progress = `[${i + 1}/${total}]`
        const nameParts = user.name?.split(' ') || []

        try {
            await resend.contacts.create({
                audienceId: AUDIENCE_ID,
                email: user.email,
                firstName: nameParts[0] || '',
                lastName: nameParts.slice(1).join(' ') || ''
            })

            success++
            fs.appendFileSync(SUCCESS_FILE, `${user.email}\n`)
            console.error('backfillResendContacts', `${progress} OK ${user.email}`)
        } catch (error) {
            failed++
            fs.appendFileSync(FAIL_FILE, `${user.email}\n`)
            console.error('backfillResendContacts', `${progress} FAIL ${user.email}`, error)
        }

        await sleep(BATCH_DELAY_MS)
    }

    console.error('backfillResendContacts', `Done. Success: ${success}, Failed: ${failed}`)
    console.error('backfillResendContacts', `Success log: ${SUCCESS_FILE}`)
    console.error('backfillResendContacts', `Fail log: ${FAIL_FILE}`)
    process.exit(0)
}

run()