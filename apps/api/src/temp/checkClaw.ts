import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'

const run = async () => {
    const result = await db
        .select({
            id: claws.id,
            polarSubscriptionId: claws.polarSubscriptionId,
            polarCustomerId: claws.polarCustomerId,
            polarProductId: claws.polarProductId,
            subscriptionStatus: claws.subscriptionStatus,
            status: claws.status,
            billingInterval: claws.billingInterval
        })
        .from(claws)
        .where(eq(claws.id, '0d0872fc-a8e6-4309-a9d5-a9b13ca4bba9'))
        .limit(1)

    console.log(JSON.stringify(result[0], null, 2))
    process.exit(0)
}

run()