import 'dotenv/config'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { subscriptions, products } from '@/lib/polar'

const run = async () => {
    const clawId = process.argv[2]
    const newPlanId = process.argv[3]
    const newProductId = process.argv[4]

    if (!clawId || !newPlanId || !newProductId) {
        console.error(
            'Usage: tsx scripts/switch-plan.ts <claw-id> <new-plan-id> <new-polar-product-id>'
        )
        console.error('')
        console.error('  claw-id:              The claw ID to switch')
        console.error(
            '  new-plan-id:          The new server type name (e.g. cx22, cx32)'
        )
        console.error(
            '  new-polar-product-id: The Polar product ID for the new plan'
        )
        process.exit(1)
    }

    const [[claw], product] = await Promise.all([
        db.select().from(claws).where(eq(claws.id, clawId)).limit(1),
        products.get(newProductId)
    ])

    if (!claw) {
        console.error(`Claw "${clawId}" not found`)
        process.exit(1)
    }

    if (!claw.polarSubscriptionId) {
        console.error('Claw has no Polar subscription (free claw?)')
        process.exit(1)
    }

    if (!product) {
        console.error(`Polar product "${newProductId}" not found`)
        process.exit(1)
    }

    console.log(`Claw: ${claw.name} (${claw.id})`)
    console.log(`Current plan: ${claw.planId}`)
    console.log(`Current Polar product: ${claw.polarProductId}`)
    console.log(`Subscription: ${claw.polarSubscriptionId}`)
    console.log('')

    console.log(`New plan: ${newPlanId}`)
    console.log(`New Polar product: ${product.name} (${product.id})`)
    console.log('')

    console.log('Updating Polar subscription...')

    const updated = await subscriptions.changeProduct(
        claw.polarSubscriptionId,
        newProductId
    )

    if (!updated) {
        console.error('Failed to update Polar subscription')
        process.exit(1)
    }

    console.log(`Polar subscription updated (product: ${updated.productId})`)

    console.log('Updating claw record...')

    await db
        .update(claws)
        .set({
            planId: newPlanId,
            polarProductId: newProductId
        })
        .where(eq(claws.id, clawId))

    console.log('')
    console.log('Done!')
    console.log(`  Plan: ${claw.planId} -> ${newPlanId}`)
    console.log(`  Product: ${claw.polarProductId} -> ${newProductId}`)
}

run().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
})