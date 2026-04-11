import 'dotenv/config'
import { eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { getProvider } from '@/services/provider'

const AFFECTED_SUB_IDS = [
    '7b45c225-8a9c-419f-ad65-5fd8cdb7e48b',
    '306d7f06-adcc-4ad0-a151-42c3f907a0c9',
    'ffe1c673-45c2-42e8-9ff7-05b4eafe7425',
    '56049e30-e64b-4b5c-97e2-1e26bb784b48',
    'adfc098b-6443-4a37-a6f3-9b10a4a4a8ce',
    'd49d0fef-a3d1-46ef-9de7-c76068365f2e',
    'b93c243a-0f13-4fb3-ba11-2edae7300d6b',
    '5d38978a-3ca5-4cb0-844d-00e7bc2b03b2',
    '86c29ed0-ea2b-4ad9-b4f4-1b47ba71254c',
    '83df0f49-db01-42ee-9ffc-af49dafaccb4',
    '62ebe222-c4a3-49d2-a8bb-ab2fc6921456',
    'f186ea08-9e10-410a-9c59-5f944f0d32fc',
    'e1ad4b42-fb0a-47d1-a0e7-d6b5b2870258',
    '138c545e-3db6-4476-9898-736395524766',
    '32dfdb4a-1c15-400f-a57c-c92857308f2d'
]

const AFFECTED_CLAW_IDS = [
    'ff5f9831-7289-49c9-a5c3-5bd13120de45',
    '1842c0d9-b13c-4f68-8762-047f1c5d0c8a',
    '0e4205c6-53ad-4c7d-971c-0d28036e23a0',
    '1418f59b-1044-49f1-a7a5-e8e1b7cb3f4d',
    'ca58f003-8fa9-4178-9b53-fd8a7c8293d7',
    '92c735ba-4bc0-4663-8912-d1592749b3e8',
    '94811b43-1dd9-44a5-9e46-cf7ec6263ec2',
    '58e3bcde-55f3-415d-a20e-baf8576694d1',
    'edd5a74a-a279-4efd-a236-66ce806d7941',
    '3e69eb99-539e-4366-b7a1-983ac23e2dd0',
    '8beed98a-7c42-4a09-9789-ead30259c254',
    'a9aca104-4131-4869-94ff-e01b000a63d3',
    '094f1b6c-e07c-493d-868e-f18368fd4f86',
    'bd78a333-ba2b-405d-9563-95183b3c62c4',
    '7b4cb020-e14d-48e4-a2b0-ad550e3d68d4'
]

const run = async () => {
    const provider = getProvider()
    const hetznerServers = await provider.getServers()

    console.log('=== DAMAGE ASSESSMENT ===\n')

    console.log('--- DB RECORDS ---')
    const remaining = await db
        .select({
            id: claws.id,
            name: claws.name,
            status: claws.status,
            subscriptionStatus: claws.subscriptionStatus,
            providerServerId: claws.providerServerId,
            ip: claws.ip,
            subdomain: claws.subdomain,
            deletionScheduledAt: claws.deletionScheduledAt
        })
        .from(claws)
        .where(inArray(claws.id, AFFECTED_CLAW_IDS))

    console.log(`DB records still exist: ${remaining.length} / 15\n`)

    for (const claw of remaining) {
        const serverExists = claw.providerServerId
            ? hetznerServers.has(claw.providerServerId)
            : false
        console.log(`[DB EXISTS] ${claw.name} (${claw.id})`)
        console.log(
            `  status: ${claw.status}, subStatus: ${claw.subscriptionStatus}`
        )
        console.log(
            `  serverId: ${claw.providerServerId}, serverInHetzner: ${serverExists}`
        )
        console.log(`  deletionScheduledAt: ${claw.deletionScheduledAt}`)
        console.log()
    }

    const missingIds = AFFECTED_CLAW_IDS.filter(
        (id) => !remaining.find((r) => r.id === id)
    )
    if (missingIds.length > 0) {
        console.log('--- FULLY DELETED (DB record gone) ---')
        const names = [
            'hashbot',
            'individual-direction',
            'Bobby',
            'mia',
            'vivid-otter',
            'MASTER',
            'DanaClawHost',
            'pipp',
            'test1',
            'Jarvis',
            'Helpers',
            'vivid-brook',
            'SorenClaw',
            'HelloWorld',
            'gtm'
        ]
        for (const id of missingIds) {
            const idx = AFFECTED_CLAW_IDS.indexOf(id)
            console.log(`[DESTROYED] ${names[idx]} (${id})`)
        }
    }

    console.log(`\n--- SUMMARY ---`)
    console.log(`DB records remaining: ${remaining.length}`)
    console.log(`DB records deleted: ${missingIds.length}`)
    console.log(
        `Of remaining, servers still in Hetzner: ${remaining.filter((c) => c.providerServerId && hetznerServers.has(c.providerServerId)).length}`
    )

    process.exit(0)
}

run()