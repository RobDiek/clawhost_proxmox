import 'dotenv/config'

import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { users, referrals, referralPayments } from '@/db/schema'

const run = async () => {
    const dryRun = !process.argv.includes('--apply')

    if (dryRun) {
        console.log('DRY RUN — no changes will be made.')
        console.log('Pass --apply to actually update the database.\n')
    } else {
        console.log('LIVE RUN — changes will be written to the database.\n')
    }

    const referralCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(referrals)

    const usersWithCodes = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(sql`${users.referralCode} IS NOT NULL`)

    const usersWithReferredBy = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(sql`${users.referredBy} IS NOT NULL`)

    console.log(`Referral rows to delete: ${referralCount[0].count}`)
    console.log(
        `Users with referral codes to clear: ${usersWithCodes[0].count}`
    )
    console.log(
        `Users with referredBy to clear: ${usersWithReferredBy[0].count}`
    )

    if (dryRun) {
        console.log('\nNo changes made. Run with --apply to execute.')
        process.exit(0)
    }

    console.log('\nClearing referral payments...')
    await db.delete(referralPayments)

    console.log('Clearing referrals table...')
    await db.delete(referrals)

    console.log('Resetting referral fields on users...')
    await db.update(users).set({
        referralCode: null,
        referralCodeChanged: false,
        referredBy: null
    })

    console.log('\nDone. All referral data has been reset.')
    process.exit(0)
}

run().catch((err) => {
    console.error('Script failed:', err)
    process.exit(1)
})