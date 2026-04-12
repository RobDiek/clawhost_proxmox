import { withClaw } from '@/controllers/agents/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import executeSSH from '@/services/ssh'
import parseMetricsOutput from '@/controllers/agents/getClawMetrics/parsers'

const SEPARATOR = '---CLAWHOST_METRICS_SEP---'

const getClawMetrics = withClaw({ requireSSH: 'api.failedToGetMetrics' })(
    async (c, claw) => {
        try {
            const command = [
                "top -bn1 | head -5 | grep '%Cpu\\|Tasks'",
                `echo '${SEPARATOR}'`,
                'free -b 2>&1',
                `echo '${SEPARATOR}'`,
                'df -B1 / 2>&1',
                `echo '${SEPARATOR}'`,
                'cat /proc/loadavg 2>&1',
                `echo '${SEPARATOR}'`,
                'cat /proc/net/dev 2>&1',
                `echo '${SEPARATOR}'`,
                'ps aux --sort=-%cpu --no-headers | head -10 2>&1',
                `echo '${SEPARATOR}'`,
                'uptime 2>&1',
                `echo '${SEPARATOR}'`,
                'nproc 2>&1'
            ].join('; ')

            const output = await executeSSH(
                claw.ip!,
                claw.rootPassword!,
                command
            )
            const parts = output.split(SEPARATOR)

            return ok(c, parseMetricsOutput(parts), t('api.metricsFetched'))
        } catch (error) {
            console.error('getClawMetrics', error)
            return fail(c, t('api.failedToGetMetrics'), 500)
        }
    }
)

export default getClawMetrics