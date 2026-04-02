import type { VersionCheckResult } from '@/ts/Interfaces'
import type { VersionGatedFeature } from '@/ts/Types'

import executeSSH from '@/services/ssh'
import isVersionSupported from '@/controllers/claws/helpers/isVersionSupported'

const VERSION_CACHE_TTL = 120_000

const versionCache = new Map<string, { version: string; expiresAt: number }>()

const getClawVersion = async (
    ip: string,
    rootPassword: string
): Promise<string> => {
    const cached = versionCache.get(ip)
    if (cached && cached.expiresAt > Date.now()) {
        return cached.version
    }

    const output = await executeSSH(
        ip,
        rootPassword,
        'su - openclaw -c "openclaw --version" 2>/dev/null || echo "unknown"',
        8000
    )

    const version = output.trim() || 'unknown'
    versionCache.set(ip, { version, expiresAt: Date.now() + VERSION_CACHE_TTL })

    return version
}

const checkFeatureVersion = async (
    ip: string,
    rootPassword: string,
    feature: VersionGatedFeature
): Promise<VersionCheckResult> => {
    const version = await getClawVersion(ip, rootPassword)
    const supported = isVersionSupported(version, feature)

    return { supported, version }
}

const invalidateVersionCache = (ip: string): void => {
    versionCache.delete(ip)
}

export default checkFeatureVersion
export { invalidateVersionCache }