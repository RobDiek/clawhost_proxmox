import 'dotenv/config'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { getPolarClient } from '@/lib/polar'

const run = async () => {
    const claw = await db
        .select()
        .from(claws)
        .where(eq(claws.id, '6d4822e8-f113-418c-bc77-0960b8b8e9c0'))
        .limit(1)
        .then((r) => r[0])

    if (!claw) {
        console.log('Not found')
        return
    }

    console.log('DB row:')
    console.log(JSON.stringify(claw, null, 2))

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
    } else {
        console.log('\nNo polarSubscriptionId on the DB row')
    }
}

run().catch((err) => {
    console.error('Fatal:', err)
    process.exit(1)
})