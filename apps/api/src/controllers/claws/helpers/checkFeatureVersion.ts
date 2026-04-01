import type { VersionCheckResult } from '@/ts/Interfaces'
import type { VersionGatedFeature } from '@/ts/Types'

import executeSSH from '@/services/ssh'
import isVersionSupported from '@/controllers/claws/helpers/isVersionSupported'

const checkFeatureVersion = async (
    ip: string,
    rootPassword: string,
    feature: VersionGatedFeature
): Promise<VersionCheckResult> => {
    const output = await executeSSH(
        ip,
        rootPassword,
        'su - openclaw -c "openclaw --version" 2>/dev/null || echo "unknown"',
        8000
    )

    const version = output.trim() || 'unknown'
    const supported = isVersionSupported(version, feature)

    return { supported, version }
}

export default checkFeatureVersion