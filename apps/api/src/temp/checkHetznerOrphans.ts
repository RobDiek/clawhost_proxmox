import 'dotenv/config'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { getProvider } from '@/services/provider'
import getClient from '@/services/hetzner/hetznerClient'

const run = async () => {
    console.log('=== HETZNER FULL SERVER LIST vs DB ===\n')

    const client = getClient()

    interface HetznerServer {
        id: number
        name: string
        status: string
        public_net: { ipv4: { ip: string } }
        server_type: { name: string }
        datacenter: { location: { name: string } }
        created: string
    }

    interface HetznerResponse {
        servers: HetznerServer[]
        meta: { pagination: { last_page: number } }
    }

    const allServers: HetznerServer[] = []

    const first = await client.get<HetznerResponse>('/servers?per_page=50&page=1')
    allServers.push(...first.servers)

    const lastPage = first.meta.pagination.last_page
    if (lastPage > 1) {
        for (let page = 2; page <= lastPage; page++) {
            const res = await client.get<HetznerResponse>(`/servers?per_page=50&page=${page}`)
            allServers.push(...res.servers)
        }
    }

    const allClaws = await db.select().from(claws)
    const dbServerIds = new Set(allClaws.map((c) => c.providerServerId).filter(Boolean))

    console.log(`Hetzner servers: ${allServers.length}`)
    console.log(`DB claws with serverId: ${dbServerIds.size}\n`)

    console.log('--- ALL HETZNER SERVERS ---')
    for (const server of allServers) {
        const inDb = dbServerIds.has(server.id.toString())
        const tag = inDb ? 'MATCHED' : 'ORPHAN'
        console.log(`[${tag}] ${server.name}`)
        console.log(`  ID: ${server.id}, Status: ${server.status}`)
        console.log(`  IP: ${server.public_net?.ipv4?.ip}`)
        console.log(`  Type: ${server.server_type?.name}, Location: ${server.datacenter?.location?.name}`)
        console.log(`  Created: ${server.created}`)
        console.log()
    }

    const orphans = allServers.filter((s) => !dbServerIds.has(s.id.toString()))
    console.log(`\n--- SUMMARY ---`)
    console.log(`Total Hetzner servers: ${allServers.length}`)
    console.log(`Matched to DB: ${allServers.length - orphans.length}`)
    console.log(`Orphans (no DB record): ${orphans.length}`)

    process.exit(0)
}

run()