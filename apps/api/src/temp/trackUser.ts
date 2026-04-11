import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws, users, sshKeys, volumes } from '@/db/schema'
import { subscriptions } from '@/lib/polar'
import { getProvider } from '@/services/provider'

const EMAIL = 'maxwellallen216@gmail.com'

const run = async () => {
    console.log(`=== TRACKING USER: ${EMAIL} ===\n`)

    const user = await db
        .select()
        .from(users)
        .where(eq(users.email, EMAIL))
        .limit(1)

    if (!user[0]) {
        console.log('[USER] Not found in DB')
        process.exit(0)
    }

    const u = user[0]
    console.log('[USER]')
    console.log(`  ID: ${u.id}`)
    console.log(`  Email: ${u.email}`)
    console.log(`  Name: ${u.name}`)
    console.log(`  Role: ${u.role}`)
    console.log(`  Auth Methods: ${u.authMethods}`)
    console.log(`  Polar Customer ID: ${u.polarCustomerId}`)
    console.log(`  Created: ${u.createdAt}`)

    const userClaws = await db
        .select()
        .from(claws)
        .where(eq(claws.userId, u.id))

    console.log(`\n[CLAWS] Found: ${userClaws.length}`)

    const provider = getProvider()
    const hetznerServers = await provider.getServers()

    for (const claw of userClaws) {
        console.log(`\n  --- ${claw.name} (${claw.id}) ---`)
        console.log(`  Status: ${claw.status}`)
        console.log(`  Subscription Status: ${claw.subscriptionStatus}`)
        console.log(`  Plan: ${claw.planId}, Location: ${claw.location}`)
        console.log(`  IP: ${claw.ip}`)
        console.log(`  Subdomain: ${claw.subdomain}`)
        console.log(`  Server ID: ${claw.providerServerId}`)
        console.log(`  Billing Interval: ${claw.billingInterval}`)
        console.log(`  Deletion Scheduled: ${claw.deletionScheduledAt}`)
        console.log(`  Created: ${claw.createdAt}`)

        if (claw.providerServerId) {
            const serverStatus = hetznerServers.get(claw.providerServerId)
            console.log(`  Hetzner: ${serverStatus ? serverStatus.status : 'NOT FOUND'}`)
        }

        if (claw.polarSubscriptionId) {
            console.log(`  Polar Sub ID: ${claw.polarSubscriptionId}`)
            const sub = await subscriptions.get(claw.polarSubscriptionId)
            if (sub) {
                console.log(`  Polar Status: ${sub.status}`)
                console.log(`  Polar Amount: $${sub.amount / 100}/${sub.currency}`)
                console.log(`  Polar Period: ${sub.currentPeriodStart} → ${sub.currentPeriodEnd}`)
                console.log(`  Cancel at period end: ${sub.cancelAtPeriodEnd}`)
            } else {
                console.log(`  Polar: SUBSCRIPTION NOT FOUND`)
            }
        }

        const clawVolumes = await db
            .select()
            .from(volumes)
            .where(eq(volumes.clawId, claw.id))

        if (clawVolumes.length > 0) {
            console.log(`  Volumes: ${clawVolumes.length}`)
            for (const vol of clawVolumes) {
                console.log(`    - ${vol.name} (${vol.size}GB, status: ${vol.status})`)
            }
        }
    }

    const userKeys = await db
        .select()
        .from(sshKeys)
        .where(eq(sshKeys.userId, u.id))

    if (userKeys.length > 0) {
        console.log(`\n[SSH KEYS] Found: ${userKeys.length}`)
        for (const key of userKeys) {
            console.log(`  - ${key.name} (${key.id})`)
        }
    }

    console.log('\n=== END ===')
    process.exit(0)
}

run()