import type { CloudProvider } from '@/ts/Interfaces'

import hetzner from '@/services/hetzner'
import proxmox from '@/services/proxmox'
import cache from '@/services/provider/cache'

const CACHE_TTL = 5 * 60 * 1000
const SERVERS_CACHE_TTL = 10 * 1000

const inflight = new Map<string, Promise<unknown>>()

const cached = <T>(
    key: string,
    fn: () => Promise<T>,
    ttl = CACHE_TTL
): Promise<T> => {
    const entry = cache.get(key)
    if (entry && Date.now() < entry.expiry)
        return Promise.resolve(entry.data as T)

    const pending = inflight.get(key)
    if (pending) return pending as Promise<T>

    const promise = fn()
        .then((data) => {
            cache.set(key, { data, expiry: Date.now() + ttl })
            jsInflightDelete(key)
            return data
        })
        .catch((err) => {
            jsInflightDelete(key)
            throw err
        })

    inflight.set(key, promise)
    return promise
}

const jsInflightDelete = (key: string) => {
    inflight.delete(key)
}

let wrappedProvider: CloudProvider | null = null
let currentProviderType: string | null = null

const getProvider = (): CloudProvider => {
    const providerType = process.env.CLOUD_PROVIDER || 'hetzner'

    if (wrappedProvider && currentProviderType === providerType) {
        return wrappedProvider
    }

    const providerImpl = providerType === 'proxmox' ? proxmox : hetzner

    const invalidateServer = (serverId: string) => {
        cache.delete(`${providerType}:servers`)
        cache.delete(`${providerType}:server:${serverId}`)
    }

    const wrapped: CloudProvider = {
        ...providerImpl,
        getServer: (serverId: string) =>
            cached(
                `${providerType}:server:${serverId}`,
                () => providerImpl.getServer(serverId),
                SERVERS_CACHE_TTL
            ),
        getServers: () =>
            cached(
                `${providerType}:servers`,
                () => providerImpl.getServers(),
                SERVERS_CACHE_TTL
            ),
        getServerTypes: () =>
            cached(`${providerType}:serverTypes`, () => providerImpl.getServerTypes()),
        getLocations: () =>
            cached(`${providerType}:locations`, () => providerImpl.getLocations()),
        getRawServerTypes: () =>
            cached(`${providerType}:rawServerTypes`, () => providerImpl.getRawServerTypes()),
        getDatacenters: () =>
            cached(`${providerType}:datacenters`, () => providerImpl.getDatacenters()),
        getVolumePricing: () =>
            cached(`${providerType}:volumePricing`, () => providerImpl.getVolumePricing()),
        createServer: async (...args) => {
            const result = await providerImpl.createServer(...args)
            cache.delete(`${providerType}:servers`)
            return result
        },
        startServer: async (serverId) => {
            await providerImpl.startServer(serverId)
            invalidateServer(serverId)
        },
        stopServer: async (serverId) => {
            await providerImpl.stopServer(serverId)
            invalidateServer(serverId)
        },
        restartServer: async (serverId) => {
            await providerImpl.restartServer(serverId)
            invalidateServer(serverId)
        },
        deleteServer: async (serverId) => {
            await providerImpl.deleteServer(serverId)
            invalidateServer(serverId)
        }
    }

    wrappedProvider = wrapped
    currentProviderType = providerType
    return wrapped
}

export default getProvider