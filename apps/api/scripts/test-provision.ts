import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { agentType as agentTypeConst, billingInterval } from '@openclaw/shared'
import { db } from '@/db'
import { agents, users, pendingAgents } from '@/db/schema'
import provisionAgent from '@/controllers/agents/provisionAgent'
import {
    generateAgentName,
    generatePassword
} from '@/controllers/agents/helpers'
import { encrypt } from '@/lib/encryption'

const parseArg = (flag: string): string | null => {
    const idx = process.argv.indexOf(flag)
    if (idx === -1 || idx === process.argv.length - 1) return null
    return process.argv[idx + 1] || null
}

const usage = (): never => {
    console.error(`
Usage:
  bun scripts/test-provision.ts --email <user-email> [options]

Options:
  --email <email>     User to attach the test agent to (required)
  --type <type>       'openclaw' or 'hermes' (default: hermes)
  --plan <plan>       Hetzner server type, e.g. cx22, cx32 (default: cx22)
  --location <loc>    Hetzner location, e.g. fsn1, nbg1, hel1 (default: fsn1)
  --name <name>       Agent name (default: random)

What this does:
  Bypasses Polar checkout and provisions a real Hetzner server using the
  same code path as a paid purchase. You pay the Hetzner cost; no Polar
  invoice is created. The agent appears in the user's dashboard and can
  be deleted from there.
`)
    process.exit(1)
}

const run = async (): Promise<void> => {
    const email = parseArg('--email')
    if (!email) usage()

    const rawType = parseArg('--type') || agentTypeConst.HERMES
    const selectedType =
        rawType === agentTypeConst.OPENCLAW
            ? agentTypeConst.OPENCLAW
            : agentTypeConst.HERMES
    const planId = parseArg('--plan') || 'cx22'
    const location = parseArg('--location') || 'fsn1'
    const name = parseArg('--name') || generateAgentName()

    const userResult = await db
        .select()
        .from(users)
        .where(eq(users.email, email!))
        .limit(1)

    if (!userResult[0]) {
        console.error(`User not found: ${email}`)
        process.exit(1)
    }

    const user = userResult[0]
    const pendingId = crypto.randomUUID()
    const rootPassword = generatePassword()
    const testRunId = crypto.randomUUID()

    console.log('=== test-provision ===')
    console.log(`  user:     ${user.email} (${user.id})`)
    console.log(`  type:     ${selectedType}`)
    console.log(`  plan:     ${planId}`)
    console.log(`  location: ${location}`)
    console.log(`  name:     ${name}`)
    console.log('')

    await db.insert(pendingAgents).values({
        id: pendingId,
        userId: user.id,
        checkoutId: `test-${testRunId}`,
        name,
        agentType: selectedType,
        planId,
        location,
        rootPassword: encrypt(rootPassword),
        gatewayToken: null,
        sshKeyId: null,
        volumeSize: null,
        priceMonthly: 0,
        billingInterval: billingInterval.MONTH,
        referralCode: null,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    })

    console.log('Provisioning Hetzner server (this takes 1-3 minutes)...')

    const result = await provisionAgent({
        pendingAgentId: pendingId,
        subscriptionId: `test-sub-${testRunId}`,
        productId: `test-prod-${testRunId}`,
        customerId: user.polarCustomerId || `test-cust-${testRunId}`
    })

    if (!result.success || !result.agentId) {
        console.error('FAILED:', result.error || 'unknown error')
        process.exit(1)
    }

    const agentId = result.agentId

    const [createdAgent] = await db
        .select({ ip: agents.ip })
        .from(agents)
        .where(eq(agents.id, agentId))
        .limit(1)
    const ip = createdAgent?.ip || '<not yet assigned>'

    console.log('')
    console.log('Server created. Cloud-init now running on the box.')
    console.log('')
    console.log('Useful info:')
    console.log(`  agent id:       ${agentId}`)
    console.log(`  ip:             ${ip}`)
    console.log(`  root password:  ${rootPassword}`)
    console.log(`  ssh:            ssh root@${ip}`)
    console.log(`  watch install:  tail -f /var/log/cloud-init-output.log`)
    if (selectedType === agentTypeConst.HERMES) {
        console.log(`  verify hermes:  su - hermes -c 'hermes --version'`)
    }
    console.log('')
    console.log(
        'Delete from the dashboard when done — or run a hard-delete script.'
    )

    process.exit(0)
}

run().catch((error) => {
    console.error('test-provision', error)
    process.exit(1)
})