import type { BundledSkillInfo, SkillEntryConfig } from '@/ts/Interfaces'

import executeSSH from '@/services/ssh'
import { BASE_DIR, withClaw } from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const SKILLS_SEPARATOR = '---SKILLS_SEPARATOR---'
const DESC_SEPARATOR = '---DESC_SEPARATOR---'

const getClawSkills = withErrorHandler(
    'getClawSkills',
    'api.skillsFetchFailed'
)(
    withClaw({ requireSSH: 'api.skillsFetchFailed' })(async (c, claw) => {
        try {
            const echoLine = 'echo "$n' + DESC_SEPARATOR + '$d"'
            const forBody =
                'n=$(basename "$s"); d=$(head -10 "$s/SKILL.md" 2>/dev/null | grep -v "^#" | grep -v "^$" | grep -v "^---" | head -1); ' +
                echoLine
            const skillsCmd =
                'sd=$(npm root -g 2>/dev/null)/openclaw/skills; if [ -d "$sd" ]; then for s in "$sd"/*/; do [ -d "$s" ] || continue; ' +
                forBody +
                '; done; fi'
            const output = await executeSSH(
                claw.ip!,
                claw.rootPassword!,
                `cat ${BASE_DIR}/openclaw.json 2>/dev/null || echo '{}'; echo '${SKILLS_SEPARATOR}'; ${skillsCmd}`,
                20000
            )

            const parts = output.split(SKILLS_SEPARATOR)
            const configOutput = (parts[0] || '{}').trim()
            const skillsOutput = (parts[1] || '').trim()

            let entries: Record<string, SkillEntryConfig> = {}
            try {
                const config = JSON.parse(configOutput)
                entries = config?.skills?.entries || {}
            } catch {
                entries = {}
            }

            const skills: BundledSkillInfo[] = skillsOutput
                .split('\n')
                .map((line) => line.trim())
                .filter(
                    (line) => line.length > 0 && line.includes(DESC_SEPARATOR)
                )
                .map((line) => {
                    const sepIndex = line.indexOf(DESC_SEPARATOR)
                    const name = line.substring(0, sepIndex).trim()
                    const description = line
                        .substring(sepIndex + DESC_SEPARATOR.length)
                        .trim()
                    return {
                        name,
                        enabled: entries[name]?.enabled !== false,
                        description: description || undefined
                    }
                })
                .filter((s) => s.name.length > 0)

            return ok(c, { skills, entries }, t('api.skillsFetched'))
        } catch {
            return fail(c, t('api.skillsFetchFailed'), 500)
        }
    })
)

export default getClawSkills