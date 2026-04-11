import executeSSH from '@/services/ssh'
import versionCache from '@/controllers/agents/helpers/versionCache'

const VERSION_CACHE_TTL = 60 * 1000

const cleanVersionOutput = (raw: string): string => {
    const trimmed = raw.trim()
    const cleaned = trimmed
        .replace(/\s*\([a-f0-9]+\)\s*$/, '')
        .replace(/^OpenClaw\s*/i, '')
        .trim()
    return cleaned || 'unknown'
}

const fetchClawVersion = async (
    ip: string,
    rootPassword: string
): Promise<string> => {
    const cached = versionCache.get(ip)
    if (cached && Date.now() < cached.expiresAt) return cached.version

    const output = await executeSSH(
        ip,
        rootPassword,
        'su - openclaw -c "openclaw --version" 2>/dev/null || echo "unknown"'
    )

    const version = cleanVersionOutput(output)
    versionCache.set(ip, { version, expiresAt: Date.now() + VERSION_CACHE_TTL })
    return version
}

export default fetchClawVersion