import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { subscriptions } from '@/lib/polar'

const REVOKED_SUBS = [
    { subId: '7b45c225-8a9c-419f-ad65-5fd8cdb7e48b', name: 'hashbot' },
    {
        subId: '306d7f06-adcc-4ad0-a151-42c3f907a0c9',
        name: 'individual-direction'
    },
    { subId: 'ffe1c673-45c2-42e8-9ff7-05b4eafe7425', name: 'Bobby' },
    { subId: '56049e30-e64b-4b5c-97e2-1e26bb784b48', name: 'mia' },
    { subId: 'adfc098b-6443-4a37-a6f3-9b10a4a4a8ce', name: 'vivid-otter' },
    { subId: 'd49d0fef-a3d1-46ef-9de7-c76068365f2e', name: 'MASTER' },
    { subId: 'b93c243a-0f13-4fb3-ba11-2edae7300d6b', name: 'DanaClawHost' },
    { subId: '5d38978a-3ca5-4cb0-844d-00e7bc2b03b2', name: 'pipp' },
    { subId: '86c29ed0-ea2b-4ad9-b4f4-1b47ba71254c', name: 'test1' },
    { subId: '83df0f49-db01-42ee-9ffc-af49dafaccb4', name: 'Jarvis' },
    { subId: '62ebe222-c4a3-49d2-a8bb-ab2fc6921456', name: 'Helpers' },
    { subId: 'f186ea08-9e10-410a-9c59-5f944f0d32fc', name: 'vivid-brook' },
    { subId: 'e1ad4b42-fb0a-47d1-a0e7-d6b5b2870258', name: 'SorenClaw' },
    { subId: '138c545e-3db6-4476-9898-736395524766', name: 'HelloWorld' },
    { subId: '32dfdb4a-1c15-400f-a57c-c92857308f2d', name: 'gtm' }
]

const run = async () => {
    let restored = 0
    let failed = 0

    for (const { subId, name } of REVOKED_SUBS) {
        console.log(`[TRYING] ${name} - ${subId}`)

        const result = await subscriptions.uncancel(subId)
        if (result && result.status === 'active') {
            await db
                .update(claws)
                .set({ subscriptionStatus: 'active' })
                .where(eq(claws.polarSubscriptionId, subId))
            console.log(`  ✓ Reactivated (status: ${result.status})`)
            restored++
        } else {
            const current = await subscriptions.get(subId)
            console.log(
                `  ✗ uncancel failed or status not active (current: ${current?.status || 'unknown'})`
            )
            failed++
        }
    }

    console.log(`\n=== RESULT ===`)
    console.log(`Restored: ${restored}`)
    console.log(`Failed: ${failed}`)

    process.exit(0)
}

run()