import 'dotenv/config'
import { subscriptions } from '@/lib/polar'

const CUSTOMER_ID = '0d06e21e-6640-4f48-8ec8-c7314419e6f1'

const run = async () => {
    console.log(`=== POLAR SUBSCRIPTIONS FOR CUSTOMER: ${CUSTOMER_ID} ===\n`)

    const subs = await subscriptions.listByCustomer(CUSTOMER_ID)

    if (subs.length === 0) {
        console.log('No subscriptions found.')
        process.exit(0)
    }

    for (const sub of subs) {
        console.log(`--- Subscription: ${sub.id} ---`)
        console.log(`  Status: ${sub.status}`)
        console.log(`  Product ID: ${sub.productId}`)
        console.log(`  Amount: $${sub.amount / 100} ${sub.currency}`)
        console.log(`  Period: ${sub.currentPeriodStart} → ${sub.currentPeriodEnd}`)
        console.log(`  Cancel at period end: ${sub.cancelAtPeriodEnd}`)
        console.log(`  Canceled at: ${sub.canceledAt}`)
        console.log(`  Ended at: ${sub.endedAt}`)
        console.log(`  Metadata: ${JSON.stringify(sub.metadata)}`)
        console.log()
    }

    console.log(`Total: ${subs.length} subscription(s)`)
    process.exit(0)
}

run()