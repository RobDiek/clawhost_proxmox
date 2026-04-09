import type {
    CacheEntry,
    CloudflareDNSRecord,
    CloudflareDNSLookup
} from '@/ts/Interfaces'

import Cloudflare from 'cloudflare'

const getClient = () => {
    const token = process.env.CLOUDFLARE_API_TOKEN
    if (!token) throw new Error('CLOUDFLARE_API_TOKEN is not set')

    return new Cloudflare({ apiToken: token })
}

const getZoneId = () => {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID
    if (!zoneId) throw new Error('CLOUDFLARE_ZONE_ID is not set')
    return zoneId
}

const DNS_CACHE_TTL = 30_000
const dnsCache = new Map<string, CacheEntry<CloudflareDNSLookup | null>>()
const dnsInflight = new Map<string, Promise<CloudflareDNSLookup | null>>()

const cloudflare = {
    async createDNSRecord(
        subdomain: string,
        ip: string
    ): Promise<CloudflareDNSRecord> {
        const client = getClient()
        const zoneId = getZoneId()

        const record = await client.dns.records.create({
            zone_id: zoneId,
            type: 'A',
            name: subdomain,
            content: ip,
            proxied: false,
            ttl: 60
        })

        dnsCache.delete(subdomain)

        return {
            id: record.id!,
            name: record.name!
        }
    },

    async updateDNSRecord(
        recordId: string,
        subdomain: string,
        ip: string
    ): Promise<void> {
        const client = getClient()
        const zoneId = getZoneId()

        await client.dns.records.update(recordId, {
            zone_id: zoneId,
            type: 'A',
            name: subdomain,
            content: ip,
            ttl: 60
        })

        dnsCache.delete(subdomain)
    },

    async deleteDNSRecord(recordId: string): Promise<void> {
        const client = getClient()
        const zoneId = getZoneId()

        await client.dns.records.delete(recordId, {
            zone_id: zoneId
        })
    },

    async findDNSRecord(
        subdomain: string
    ): Promise<CloudflareDNSLookup | null> {
        const entry = dnsCache.get(subdomain)
        if (entry && Date.now() < entry.expiry) return entry.data

        const pending = dnsInflight.get(subdomain)
        if (pending) return pending

        const client = getClient()
        const zoneId = getZoneId()
        const fullName = `${subdomain}.clawhost.cloud`

        const promise = client.dns.records
            .list({
                zone_id: zoneId,
                name: { exact: fullName },
                type: 'A'
            })
            .then((records) => {
                const record = records.result?.[0]
                const result: CloudflareDNSLookup | null = record
                    ? { id: record.id!, ip: record.content as string }
                    : null
                dnsCache.set(subdomain, {
                    data: result,
                    expiry: Date.now() + DNS_CACHE_TTL
                })
                dnsInflight.delete(subdomain)
                return result
            })
            .catch((err) => {
                dnsInflight.delete(subdomain)
                throw err
            })

        dnsInflight.set(subdomain, promise)
        return promise
    }
}

export default cloudflare