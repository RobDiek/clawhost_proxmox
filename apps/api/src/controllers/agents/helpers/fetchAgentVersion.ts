import executeSSH from '@/services/ssh'
import getAgentConfig from '@/controllers/agents/helpers/getAgentConfig'
import versionCache from '@/controllers/agents/helpers/versionCache'

const VERSION_CACHE_TTL = 60 * 1000

const cleanVersionOutput = (raw: string): string => {
    const trimmed = raw.trim()
    const cleaned = trimmed
        .replace(/\s*\([a-f0-9]+\)\s*$/, '')
        .replace(/^(OpenClaw|Hermes)\s*/i, '')
        .trim()
    return cleaned || 'unknown'
}

const fetchAgentVersion = async (
    ip: string,
    rootPassword: string,
    agentType?: string | null
): Promise<string> => {
    const cached = versionCache.get(ip)
    if (cached && Date.now() < cached.expiresAt) return cached.version

    const agent = getAgentConfig(agentType)

    const output = await executeSSH(
        ip,
        rootPassword,
        `su - ${agent.user} -c "${agent.versionCommand}" 2>/dev/null || echo "unknown"`
    )

    const version = cleanVersionOutput(output)
    versionCache.set(ip, { version, expiresAt: Date.now() + VERSION_CACHE_TTL })
    return version
}

export default fetchAgentVersion