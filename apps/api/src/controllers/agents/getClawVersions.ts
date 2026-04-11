import type { AuthenticatedContext } from '@/ts/Types'
import type {
    CacheEntry,
    NpmRegistryVersionsResponse,
    NpmDownloadsResponse,
    VersionsCacheData
} from '@/ts/Interfaces'

import { externalUrls } from '@openclaw/shared'
import { findUserClaw, fetchClawVersion } from '@/controllers/agents/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const NPM_REGISTRY_URL = externalUrls.NPM.REGISTRY('openclaw')
const NPM_DOWNLOADS_URL = externalUrls.NPM.DOWNLOADS('openclaw')

const VERSIONS_CACHE_TTL = 30 * 60 * 1000

let versionsCache: CacheEntry<VersionsCacheData> | null = null

const fetchVersionsData = async (): Promise<VersionsCacheData> => {
    if (versionsCache && Date.now() < versionsCache.expiry)
        return versionsCache.data

    const [registryResponse, downloadsResponse] = await Promise.all([
        fetch(NPM_REGISTRY_URL, {
            headers: { Accept: 'application/json' }
        }),
        fetch(NPM_DOWNLOADS_URL).catch(() => null)
    ])

    if (!registryResponse.ok) throw new Error('npm_registry_error')

    const registry =
        (await registryResponse.json()) as NpmRegistryVersionsResponse

    let downloadCounts: Record<string, number> = {}
    if (downloadsResponse?.ok) {
        const downloadsData =
            (await downloadsResponse.json()) as NpmDownloadsResponse
        downloadCounts = downloadsData.downloads || {}
    }

    const latestVersion = registry['dist-tags']?.latest || 'unknown'
    const timeEntries = registry.time || {}

    const versions = Object.entries(timeEntries)
        .filter(([key]) => /^\d/.test(key))
        .map(([version, publishedAt]) => ({
            version,
            publishedAt,
            downloads: downloadCounts[version] || 0
        }))
        .sort(
            (a, b) =>
                new Date(b.publishedAt).getTime() -
                new Date(a.publishedAt).getTime()
        )

    const data = { latestVersion, versions }
    versionsCache = { data, expiry: Date.now() + VERSIONS_CACHE_TTL }
    return data
}

const getClawVersions = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const claw = await findUserClaw(userId, id, c.get('isAdmin'))

        if (!claw) return fail(c, t('api.clawNotFound'), 404)

        if (!claw.ip || !claw.rootPassword)
            return fail(c, t('api.failedToGetVersions'), 400)

        const [currentVersion, cached] = await Promise.all([
            fetchClawVersion(claw.ip, claw.rootPassword),
            fetchVersionsData()
        ])

        return ok(c, {
            currentVersion,
            latestVersion: cached.latestVersion,
            versions: cached.versions
        })
    } catch (error) {
        console.error('getClawVersions', error)
        if (error instanceof Error && error.message === 'npm_registry_error')
            return fail(c, t('api.failedToGetVersions'), 502)
        return fail(
            c,
            error instanceof Error
                ? error.message
                : t('api.failedToGetVersions'),
            500
        )
    }
}

export default getClawVersions