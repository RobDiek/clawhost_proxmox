import type {
    FeatureGatedConfigUpdateParams,
    FeatureGatedConfigUpdateResult
} from '@/ts/Interfaces'

import executeSSH from '@/services/ssh'
import BASE_DIR from '@/controllers/claws/helpers/baseDir'
import applyToolsDefaults from '@/controllers/claws/helpers/applyToolsDefaults'
import applySandboxOffDefaults from '@/controllers/claws/helpers/applySandboxOffDefaults'
import checkFeatureVersion from '@/controllers/claws/helpers/checkFeatureVersion'
import parseJsonFromSSH from '@/controllers/claws/helpers/parseJsonFromSSH'
import writeConfigAndRestart from '@/controllers/claws/helpers/writeConfigAndRestart'

const withFeatureGatedConfigUpdate = async ({
    ip,
    rootPassword,
    feature,
    mutate
}: FeatureGatedConfigUpdateParams): Promise<FeatureGatedConfigUpdateResult> => {
    const { supported, version } = await checkFeatureVersion(
        ip,
        rootPassword,
        feature
    )

    if (!supported) return { ok: false, unsupportedVersion: version }

    const output = await executeSSH(
        ip,
        rootPassword,
        `cat ${BASE_DIR}/openclaw.json 2>/dev/null || echo '{}'`,
        5000
    )

    const config = parseJsonFromSSH(output)

    applyToolsDefaults(config)
    applySandboxOffDefaults(config)

    await mutate(config)

    await writeConfigAndRestart(ip, rootPassword, config)

    return { ok: true }
}

export default withFeatureGatedConfigUpdate