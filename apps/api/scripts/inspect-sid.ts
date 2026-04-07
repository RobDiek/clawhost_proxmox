import 'dotenv/config'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws, users } from '@/db/schema'
import { getPolarClient } from '@/lib/polar'

const run = async () => {
    const claw = await db
        .select()
        .from(claws)
        .where(eq(claws.id, '97268d41-1a15-4e19-8191-5b9498622915'))
        .limit(1)
        .then((r) => r[0])

    if (!claw) {
        console.log('Not found')
        return
    }

    const user = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, claw.userId))
        .limit(1)
        .then((r) => r[0])

    console.log('DB row:')
    console.log(JSON.stringify(claw, null, 2))
    console.log('\nUser:', user)

    if (claw.polarSubscriptionId) {
        const polar = getPolarClient()
        try {
            const sub = await polar.subscriptions.get({
                id: claw.polarSubscriptionId
            })
            console.log('\nPolar subscription:')
            console.log(JSON.stringify(sub, null, 2))
        } catch (err) {
            console.error(
                'Polar fetch failed:',
                err instanceof Error ? err.message : err
            )
        }
    }
}

run().catch((err) => {
    console.error('Fatal:', err)
    process.exit(1)
})