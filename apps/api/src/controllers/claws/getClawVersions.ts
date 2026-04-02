import type { AuthenticatedContext } from '@/ts/Types'
import type {
    NpmRegistryVersionsResponse,
    NpmDownloadsResponse
} from '@/ts/Interfaces'

import executeSSH from '@/services/ssh'
import { findUserClaw } from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const NPM_REGISTRY_URL = 'https://registry.npmjs.org/openclaw'
const NPM_DOWNLOADS_URL = 'https://api.npmjs.org/versions/openclaw/last-week'

const getClawVersions = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const claw = await findUserClaw(userId, id, c.get('isAdmin'))

        if (!claw) {
            return fail(c, t('api.clawNotFound'), 404)
        }

        if (!claw.ip || !claw.rootPassword) {
            return fail(c, t('api.failedToGetVersions'), 400)
        }

        const [currentOutput, registryResponse, downloadsResponse] =
            await Promise.all([
                executeSSH(
                    claw.ip,
                    claw.rootPassword,
                    'su - openclaw -c "openclaw --version" 2>/dev/null || echo "unknown"'
                ),
                fetch(NPM_REGISTRY_URL, {
                    headers: { Accept: 'application/json' }
                }),
                fetch(NPM_DOWNLOADS_URL).catch(() => null)
            ])

        const currentVersion = currentOutput.trim() || 'unknown'

        if (!registryResponse.ok) {
            return fail(c, t('api.failedToGetVersions'), 502)
        }

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
            .filter(([key]) => key !== 'created' && key !== 'modified')
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

        return ok(c, { currentVersion, latestVersion, versions })
    } catch (err) {
        console.error('Get claw versions error:', err)
        return fail(
            c,
            err instanceof Error ? err.message : t('api.failedToGetVersions'),
            500
        )
    }
}

export default getClawVersions