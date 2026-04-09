import type { VersionGatedFeature } from '@/ts/Types'

import { versionGatedFeature } from '@openclaw/shared'
import executeSSH from '@/services/ssh'
import ensureClawHub from '@/controllers/claws/helpers/ensureClawHub'
import checkFeatureVersion from '@/controllers/claws/helpers/checkFeatureVersion'
import BASE_DIR from '@/controllers/claws/helpers/baseDir'

const executeClawHubOperation = async (
    ip: string,
    rootPassword: string,
    command: string,
    agentId?: string,
    timeout = 50000,
    feature: VersionGatedFeature = versionGatedFeature.skills
): Promise<{ supported: boolean; version: string }> => {
    const { supported, version } = await checkFeatureVersion(
        ip,
        rootPassword,
        feature
    )

    if (!supported) return { supported: false, version }

    await ensureClawHub(ip, rootPassword)

    let clawHubCmd = command

    if (agentId) {
        const agentDir = `${BASE_DIR}/agents/${agentId}/workspace/skills`
        clawHubCmd = `${clawHubCmd} --workdir ${agentDir}`
    }

    const cmd = `su - openclaw -c "${clawHubCmd}" && (su - openclaw -c "openclaw doctor --fix" || true) && systemctl restart openclaw-gateway`

    await executeSSH(ip, rootPassword, cmd, timeout)

    return { supported: true, version }
}

export default executeClawHubOperation