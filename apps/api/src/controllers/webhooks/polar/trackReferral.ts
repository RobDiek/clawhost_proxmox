import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users, referrals, referralPayments } from '@/db/schema'

const trackReferral = async (
    userId: string,
    referralCode: string,
    paymentType: string
) => {
    try {
        const referrer = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.referralCode, referralCode))
            .limit(1)
            .then((rows) => rows[0])

        if (!referrer || referrer.id === userId) return

        const referralId = crypto.randomUUID()

        const inserted = await db
            .insert(referrals)
            .values({
                id: referralId,
                referrerId: referrer.id,
                referredUserId: userId
            })
            .onConflictDoNothing()
            .returning({ id: referrals.id })

        const existingReferralId =
            inserted[0]?.id ??
            (await db
                .select({ id: referrals.id })
                .from(referrals)
                .where(eq(referrals.referredUserId, userId))
                .limit(1)
                .then((rows) => rows[0]?.id))

        if (existingReferralId) {
            await db.insert(referralPayments).values({
                id: crypto.randomUUID(),
                referralId: existingReferralId,
                type: paymentType
            })
        }

        await db
            .update(users)
            .set({ referredBy: referralCode })
            .where(eq(users.id, userId))
    } catch (error) {
        console.error('trackReferral', error)
    }
}

export default trackReferral