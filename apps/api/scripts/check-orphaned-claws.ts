import 'dotenv/config'

import { eq, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { claws, users } from '@/db/schema'

const run = async () => {
    console.log('Checking for claws without a subscription ID...\n')

    const orphanedClaws = await db
        .select()
        .from(claws)
        .where(isNull(claws.polarSubscriptionId))

    if (orphanedClaws.length === 0) {
        console.log('All claws have a subscription ID.')
        return
    }

    console.log(
        `Found ${orphanedClaws.length} claw(s) WITHOUT a subscription ID:\n`
    )

    for (const claw of orphanedClaws) {
        const user = await db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.id, claw.userId))
            .limit(1)

        console.log(`  Claw: ${claw.id}`)
        console.log(`    Name: ${claw.name}`)
        console.log(`    Status: ${claw.status}`)
        console.log(
            `    Subscription Status: ${claw.subscriptionStatus || 'none'}`
        )
        console.log(`    Plan: ${claw.planId}`)
        console.log(`    Location: ${claw.location || 'unknown'}`)
        console.log(`    IP: ${claw.ip || 'none'}`)
        console.log(`    User: ${user[0]?.email || claw.userId}`)
        console.log(`    Created: ${claw.createdAt.toISOString()}`)
        console.log()
    }
}

run().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
})