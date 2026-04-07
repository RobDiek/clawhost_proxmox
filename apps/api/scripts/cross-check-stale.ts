import 'dotenv/config'

import { db } from '@/db'
import { claws } from '@/db/schema'
import { RequestClient, externalUrls } from '@openclaw/shared'
import { getPolarClient } from '@/lib/polar'
import type { HetznerServersResponse } from '@/ts/Interfaces'

const run = async () => {
    const token = process.env.HETZNER_API_TOKEN
    if (!token) throw new Error('HETZNER_API_TOKEN is not set')

    const hetzner = new RequestClient({
        baseUrl: externalUrls.HETZNER.API,
        getHeaders: () => ({ Authorization: `Bearer ${token}` })
    })

    const allServers: HetznerServersResponse['servers'] = []
    let page = 1
    while (true) {
        const data = await hetzner.get<HetznerServersResponse>(
            `/servers?per_page=50&page=${page}`
        )
        allServers.push(...data.servers)
        if (page >= data.meta.pagination.last_page) break
        page++
    }

    const dbClaws = await db.select().from(claws)

    const polar = getPolarClient()
    const polarSubs: {
        id: string
        status: string
        customerId: string
        currentPeriodEnd?: string | null
        canceledAt?: string | null
        cancelAtPeriodEnd?: boolean
    }[] = []
    let polarCursor: string | undefined
    while (true) {
        const result = await polar.subscriptions.list({
            page: polarCursor ? Number(polarCursor) : 1,
            limit: 100
        })
        const items =
            'result' in result
                ? (result as { result: { items: unknown[] } }).result.items
                : ((result as { items?: unknown[] }).items ?? [])
        for (const sub of items as {
            id: string
            status: string
            customerId: string
            currentPeriodEnd?: string | null
            canceledAt?: string | null
            cancelAtPeriodEnd?: boolean
        }[]) {
            polarSubs.push({
                id: sub.id,
                status: sub.status,
                customerId: sub.customerId,
                currentPeriodEnd: sub.currentPeriodEnd,
                canceledAt: sub.canceledAt,
                cancelAtPeriodEnd: sub.cancelAtPeriodEnd
            })
        }
        if (items.length < 100) break
        polarCursor = String((Number(polarCursor) || 1) + 1)
    }

    console.log('=== Inventory ===')
    console.log(`  Hetzner servers: ${allServers.length}`)
    console.log(`  DB claws:        ${dbClaws.length}`)
    console.log(`  Polar subs:      ${polarSubs.length}`)
    console.log()

    const hetznerIds = new Set(allServers.map((s) => String(s.id)))
    const dbProviderIds = new Set(
        dbClaws.filter((c) => c.providerServerId).map((c) => c.providerServerId!)
    )
    const dbSubIds = new Set(
        dbClaws
            .filter((c) => c.polarSubscriptionId)
            .map((c) => c.polarSubscriptionId!)
    )
    const polarSubIds = new Set(polarSubs.map((s) => s.id))
    const activePolarSubIds = new Set(
        polarSubs.filter((s) => s.status === 'active').map((s) => s.id)
    )

    console.log('=== 1. DB claws with providerServerId not in Hetzner ===')
    const dbWithoutHetzner = dbClaws.filter(
        (c) => c.providerServerId && !hetznerIds.has(c.providerServerId)
    )
    if (dbWithoutHetzner.length === 0) console.log('  none')
    for (const c of dbWithoutHetzner) {
        console.log(
            `  ${c.id}  ${c.name}  status=${c.status}  providerId=${c.providerServerId}`
        )
    }
    console.log()

    console.log('=== 2. DB claws with no providerServerId at all ===')
    const dbNoProvider = dbClaws.filter((c) => !c.providerServerId)
    if (dbNoProvider.length === 0) console.log('  none')
    for (const c of dbNoProvider) {
        console.log(
            `  ${c.id}  ${c.name}  status=${c.status}  subStatus=${c.subscriptionStatus}`
        )
    }
    console.log()

    console.log('=== 3. Hetzner servers with no DB row ===')
    const hetznerOrphans = allServers.filter(
        (s) => !dbProviderIds.has(String(s.id))
    )
    if (hetznerOrphans.length === 0) console.log('  none')
    for (const s of hetznerOrphans) {
        console.log(`  ${s.id}  ${s.name}  status=${s.status}`)
    }
    console.log()

    console.log(
        '=== 4. DB claws referencing a Polar sub that does not exist ==='
    )
    const dbBadSub = dbClaws.filter(
        (c) => c.polarSubscriptionId && !polarSubIds.has(c.polarSubscriptionId)
    )
    if (dbBadSub.length === 0) console.log('  none')
    for (const c of dbBadSub) {
        console.log(
            `  ${c.id}  ${c.name}  subId=${c.polarSubscriptionId}  dbStatus=${c.subscriptionStatus}`
        )
    }
    console.log()

    console.log(
        '=== 5. DB claws whose Polar sub is NOT active (canceled, past_due, etc) ==='
    )
    const polarById = new Map(polarSubs.map((s) => [s.id, s]))
    const dbInactiveSub = dbClaws.filter(
        (c) =>
            c.polarSubscriptionId &&
            polarSubIds.has(c.polarSubscriptionId) &&
            !activePolarSubIds.has(c.polarSubscriptionId)
    )
    if (dbInactiveSub.length === 0) console.log('  none')
    const now = Date.now()
    for (const c of dbInactiveSub) {
        const sub = polarById.get(c.polarSubscriptionId!)
        const periodEnd = sub?.currentPeriodEnd
            ? new Date(sub.currentPeriodEnd)
            : null
        const periodEndMs = periodEnd ? periodEnd.getTime() : null
        const expired =
            periodEndMs === null ? '?' : periodEndMs < now ? 'YES' : 'no'
        const daysFromNow = periodEndMs
            ? Math.round((periodEndMs - now) / 86_400_000)
            : null
        console.log(`  ${c.id}  ${c.name}`)
        console.log(
            `    polarStatus=${sub?.status}  dbStatus=${c.subscriptionStatus}  clawStatus=${c.status}`
        )
        console.log(
            `    canceledAt=${sub?.canceledAt ?? 'n/a'}  periodEnd=${periodEnd?.toISOString() ?? 'n/a'}  expired=${expired}  (${daysFromNow ?? '?'}d from now)`
        )
    }
    console.log()

    console.log(
        '=== 6. Polar active subs with no DB claw (paying for nothing) ==='
    )
    const polarOrphans = polarSubs.filter(
        (s) => s.status === 'active' && !dbSubIds.has(s.id)
    )
    if (polarOrphans.length === 0) console.log('  none')
    for (const s of polarOrphans) {
        console.log(`  ${s.id}  customer=${s.customerId}`)
    }
    console.log()

    console.log('=== Summary ===')
    console.log(
        `  DB→Hetzner missing:    ${dbWithoutHetzner.length}  (DB thinks server exists, Hetzner doesn't)`
    )
    console.log(
        `  DB no providerId:      ${dbNoProvider.length}  (probably stuck creating/failed)`
    )
    console.log(
        `  Hetzner orphans:       ${hetznerOrphans.length}  (server exists, no DB record)`
    )
    console.log(
        `  DB→Polar missing:      ${dbBadSub.length}  (DB references nonexistent sub)`
    )
    console.log(
        `  DB sub inactive:       ${dbInactiveSub.length}  (Polar canceled but claw still alive)`
    )
    console.log(
        `  Polar orphans active:  ${polarOrphans.length}  (paying customer, no claw)`
    )
}

run().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
})