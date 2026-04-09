import type { AgentIdBody, ClawHubInstalledSkill } from '@/ts/Interfaces'

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

const normalizeUpdate = (
    item: Record<string, unknown>
): ClawHubInstalledSkill => {
    const rawSlug = String(
        item.slug || item.name || item.package || item.id || ''
    )
    const slug = normalizeSlug(rawSlug)
    return {
        slug,
        name: String(item.displayName || item.name || slug),
        version: String(item.version || item.currentVersion || ''),
        hasUpdate: true,
        latestVersion: item.latestVersion
            ? String(item.latestVersion)
            : undefined
    }
}

const checkClawHubUpdates = withErrorHandler(
    'checkClawHubUpdates',
    'api.clawHubUpdatesFailed'
)(
    withClaw({ requireSSH: 'api.clawHubUpdatesFailed' })(async (c, claw) => {
        try {
            let agentId: string | undefined
            try {
                const body = await c.req.json<AgentIdBody>()
                agentId = body.agentId
            } catch {
                agentId = undefined
            }

            await ensureClawHub(claw.ip!, claw.rootPassword!)

            let clawHubCmd = 'clawhub outdated --json'

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

            const rawItems = parseJsonArrayFromSSH<Record<string, unknown>>(
                output,
                'updates'
            )
            const updates: ClawHubInstalledSkill[] =
                rawItems.map(normalizeUpdate)

            return ok(c, { updates }, t('api.clawHubUpdatesFetched'))
        } catch {
            return fail(c, t('api.clawHubUpdatesFailed'), 500)
        }
    })
)

export default checkClawHubUpdates