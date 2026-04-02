import type { VersionGatedFeature } from '@/ts/Types'

import { isFeatureSupported } from '@openclaw/shared'

const isVersionSupported = (
    raw: string,
    feature: VersionGatedFeature
): boolean => {
    return isFeatureSupported(raw, feature)
}

export default isVersionSupported