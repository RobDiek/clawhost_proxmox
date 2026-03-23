import type {
    AgentIdBody,
    ClawHubInstalledSkill,
    RawClawHubSkillItem
} from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import executeSSH from '@/services/ssh'
import {
    findUserClaw,
    ensureClawHub,
    BASE_DIR
} from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const normalizeSlug = (raw: string): string => {
    const trimmed = raw.trim().toLowerCase()
    return trimmed.includes('/') ? trimmed.split('/').pop()! : trimmed
}

const normalizeSkill = (item: RawClawHubSkillItem): ClawHubInstalledSkill => {
    const rawSlug = String(
        item.slug || item.name || item.package || item.id || ''
    )
    const slug = normalizeSlug(rawSlug)
    return {
        slug,
        name: String(item.displayName || item.name || slug),
        version: String(item.version || item.currentVersion || ''),
        hasUpdate: !!(item.hasUpdate || item.updateAvailable),
        latestVersion: item.latestVersion
            ? String(item.latestVersion)
            : undefined
    }
}

const getClawHubInstalled = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const claw = await findUserClaw(userId, id)

        if (!claw) {
            return fail(c, t('api.clawNotFound'), 404)
        }

        if (!claw.ip || !claw.rootPassword) {
            return fail(c, t('api.clawHubFetchFailed'), 400)
        }

        try {
            let agentId: string | undefined
            try {
                const body = await c.req.json<AgentIdBody>()
                agentId = body.agentId
            } catch {
                agentId = undefined
            }

            await ensureClawHub(claw.ip, claw.rootPassword)

            let clawHubCmd = 'clawhub list --json'

            if (agentId) {
                const agentDir = `${BASE_DIR}/agents/${agentId}/workspace/skills`
                clawHubCmd = `${clawHubCmd} --workdir ${agentDir}`
            }

            const cmd = `su - openclaw -c "${clawHubCmd}" 2>/dev/null || echo '[]'`

            const output = await executeSSH(
                claw.ip,
                claw.rootPassword,
                cmd,
                30000
            )

            let skills: ClawHubInstalledSkill[] = []
            try {
                const trimmed = output.trim()
                const arrStart = trimmed.indexOf('[')
                const objStart = trimmed.indexOf('{')
                const start =
                    arrStart >= 0 && (objStart < 0 || arrStart < objStart)
                        ? arrStart
                        : objStart
                const end =
                    start === arrStart
                        ? trimmed.lastIndexOf(']')
                        : trimmed.lastIndexOf('}')
                const jsonStr =
                    start >= 0 && end > start
                        ? trimmed.substring(start, end + 1)
                        : '[]'
                const parsed = JSON.parse(jsonStr)
                const rawItems: RawClawHubSkillItem[] = Array.isArray(parsed)
                    ? parsed
                    : parsed.skills || []
                skills = rawItems.map(normalizeSkill)
            } catch {
                skills = []
            }

            return ok(c, { skills }, t('api.clawHubFetched'))
        } catch {
            return fail(c, t('api.clawHubFetchFailed'), 500)
        }
    } catch {
        return fail(c, t('api.clawHubFetchFailed'), 500)
    }
}

export default getClawHubInstalled