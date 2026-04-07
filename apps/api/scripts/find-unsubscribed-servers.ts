import 'dotenv/config'

import { db } from '@/db'
import { claws } from '@/db/schema'
import { RequestClient, externalUrls } from '@openclaw/shared'
import type { HetznerServersResponse } from '@/ts/Interfaces'

const run = async () => {
    const token = process.env.HETZNER_API_TOKEN
    if (!token) throw new Error('HETZNER_API_TOKEN is not set')

    const client = new RequestClient({
        baseUrl: externalUrls.HETZNER.API,
        getHeaders: () => ({ Authorization: `Bearer ${token}` })
    })

    const allServers: HetznerServersResponse['servers'] = []
    let page = 1
    while (true) {
        const data = await client.get<HetznerServersResponse>(
            `/servers?per_page=50&page=${page}`
        )
        allServers.push(...data.servers)
        if (page >= data.meta.pagination.last_page) break
        page++
    }

    console.log(`Found ${allServers.length} Hetzner server(s) total\n`)

    const dbClaws = await db.select().from(claws)

    const knownIds = new Set<string>()
    const subscribedIds = new Set<string>()
    for (const c of dbClaws) {
        if (c.providerServerId) {
            knownIds.add(String(c.providerServerId))
            if (c.polarSubscriptionId) {
                subscribedIds.add(String(c.providerServerId))
            }
        }
    }

    const unsubscribed = allServers.filter(
        (s) => !subscribedIds.has(String(s.id))
    )

    console.log(
        `${unsubscribed.length} server(s) NOT linked to an active subscription:\n`
    )

    for (const s of unsubscribed) {
        const inDb = knownIds.has(String(s.id))
        console.log(`  ${s.id}  ${s.name}`)
        console.log(`    Status:   ${s.status}`)
        console.log(`    IP:       ${s.public_net.ipv4?.ip || 'none'}`)
        console.log(
            `    In DB:    ${inDb ? 'yes (claw/pending, no subscription)' : 'NO — orphaned at provider'}`
        )
        console.log()
    }
}

run().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
})