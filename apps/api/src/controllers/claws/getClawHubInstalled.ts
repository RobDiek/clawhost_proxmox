import type {
    AgentIdBody,
    ClawHubInstalledSkill,
    RawClawHubSkillItem
} from '@/ts/Interfaces'

import executeSSH from '@/services/ssh'
import {
    ensureClawHub,
    BASE_DIR,
    parseJsonArrayFromSSH,
    withClaw
} from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

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

const getClawHubInstalled = withErrorHandler(
    'getClawHubInstalled',
    'api.clawHubFetchFailed'
)(
    withClaw({ requireSSH: 'api.clawHubFetchFailed' })(async (c, claw) => {
        try {
            let agentId: string | undefined
            try {
                const body = await c.req.json<AgentIdBody>()
                agentId = body.agentId
            } catch {
                agentId = undefined
            }

            await ensureClawHub(claw.ip!, claw.rootPassword!)

            let clawHubCmd = 'clawhub list --json'

            if (agentId) {
                const agentDir = `${BASE_DIR}/agents/${agentId}/workspace/skills`
                clawHubCmd = `${clawHubCmd} --workdir ${agentDir}`
            }

            const cmd = `su - openclaw -c "${clawHubCmd}" 2>/dev/null || echo '[]'`

            const output = await executeSSH(
                claw.ip!,
                claw.rootPassword!,
                cmd,
                30000
            )

            const rawItems = parseJsonArrayFromSSH<RawClawHubSkillItem>(
                output,
                'skills'
            )
            const skills: ClawHubInstalledSkill[] = rawItems.map(normalizeSkill)

            return ok(c, { skills }, t('api.clawHubFetched'))
        } catch {
            return fail(c, t('api.clawHubFetchFailed'), 500)
        }
    })
)

export default getClawHubInstalled