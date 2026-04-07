import 'dotenv/config'

import { or, eq, like } from 'drizzle-orm'
import { db } from '@/db'
import { claws, pendingClaws } from '@/db/schema'

const ips = ['195.201.224.237', '188.245.221.62', '46.225.17.184']
const ids = ['120925960', '120970197', '122368737']
const nameFragments = ['noble-finch', 'gentle-grove', 'warm-falcon']

const run = async () => {
    const byIp = await db
        .select()
        .from(claws)
        .where(or(...ips.map((ip) => eq(claws.ip, ip))))

    const byProviderId = await db
        .select()
        .from(claws)
        .where(or(...ids.map((id) => eq(claws.providerServerId, id))))

    const byName = await db
        .select()
        .from(claws)
        .where(or(...nameFragments.map((n) => like(claws.name, `%${n}%`))))

    const pendingByName = await db
        .select()
        .from(pendingClaws)
        .where(or(...nameFragments.map((n) => like(pendingClaws.name, `%${n}%`))))

    console.log('claws by IP:', byIp.length, byIp)
    console.log('claws by providerServerId:', byProviderId.length, byProviderId)
    console.log('claws by name fragment:', byName.length, byName)
    console.log('pendingClaws by name fragment:', pendingByName.length, pendingByName)
}

run().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
})