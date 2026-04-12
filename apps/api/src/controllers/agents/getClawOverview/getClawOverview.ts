import { withClaw } from '@/controllers/agents/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import executeSSH from '@/services/ssh'
import parseOverviewOutput from '@/controllers/agents/getClawOverview/parsers'

const SEPARATOR = '---CLAWHOST_OVERVIEW_SEP---'

const getClawOverview = withClaw({
    requireSSH: 'api.failedToGetOverview'
})(async (c, claw) => {
    try {
        if (!claw.gatewayToken)
            return fail(c, t('api.failedToGetOverview'), 400)

        const tokenBase64 = Buffer.from(claw.gatewayToken).toString('base64')

        const command = [
            `TOKEN=$(echo '${tokenBase64}' | base64 -d)`,
            `curl -s http://127.0.0.1:18789/api/status 2>/dev/null || echo 'null'`,
            `echo '${SEPARATOR}'`,
            `curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:18789/api/sessions 2>/dev/null || echo 'null'`,
            `echo '${SEPARATOR}'`,
            "cat /home/openclaw/.openclaw/openclaw.json 2>/dev/null || echo 'null'",
            `echo '${SEPARATOR}'`,
            'systemctl is-active openclaw-gateway 2>/dev/null || echo inactive',
            `echo '${SEPARATOR}'`,
            'ss -tlnp 2>/dev/null | grep 18789 || echo ""',
            `echo '${SEPARATOR}'`,
            "su - openclaw -c 'openclaw status 2>/dev/null' 2>/dev/null || echo ''"
        ].join('; ')

        const output = await executeSSH(
            claw.ip!,
            claw.rootPassword!,
            command,
            20000
        )

        const result = parseOverviewOutput(output, SEPARATOR)

        return ok(c, result, t('api.overviewFetched'))
    } catch (error) {
        console.error('getClawOverview', error)
        return fail(c, t('api.failedToGetOverview'), 500)
    }
})

export default getClawOverview