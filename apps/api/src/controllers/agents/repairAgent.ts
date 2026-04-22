import type { AuthenticatedContext } from '@/ts/Types'

import { eq } from 'drizzle-orm'
import { agentStatus } from '@openclaw/shared'
import { db } from '@/db'
import { agents } from '@/db/schema'
import executeSSH from '@/services/ssh'
import { getAgentConfig } from '@/controllers/agents/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const repairAgent = async (c: AuthenticatedContext) => {
    try {
        const id = c.req.param('id')!
        const agent = await db
            .select()
            .from(agents)
            .where(eq(agents.id, id))
            .limit(1)

        if (!agent[0]) return fail(c, t('api.clawNotFound'), 404)

        if (!agent[0].ip || !agent[0].rootPassword)
            return fail(c, t('api.failedToRepairClaw'), 400)

        const agentConfig = getAgentConfig(agent[0].agentType)
        const serviceFile = `/etc/systemd/system/${agentConfig.serviceName}.service`

        const repairCommands = [
            "sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config",
            "grep -q '^PasswordAuthentication' /etc/ssh/sshd_config || echo 'PasswordAuthentication yes' >> /etc/ssh/sshd_config",
            'systemctl restart sshd || systemctl restart ssh',
            `sed -i '/NODE_OPTIONS/d' ${serviceFile}`,
            `grep -q 'StartLimitIntervalSec' ${serviceFile} || sed -i '/RestartSec=/a\\    StartLimitIntervalSec=0' ${serviceFile}`,
            'mkdir -p /etc/systemd/system/nginx.service.d',
            "printf '[Service]\\nRestart=always\\nRestartSec=5\\n' > /etc/systemd/system/nginx.service.d/override.conf",
            'systemctl daemon-reload',
            ...(agentConfig.doctorCommand
                ? [
                      `su - ${agentConfig.user} -c "${agentConfig.doctorCommand}" || true`
                  ]
                : []),
            `systemctl restart ${agentConfig.serviceName}`,
            'sleep 10',
            'curl -sf -o /dev/null --max-time 5 http://127.0.0.1:18789 && echo "GATEWAY_OK" || echo "GATEWAY_FAILED"'
        ].join(' && ')

        const output = await executeSSH(
            agent[0].ip,
            agent[0].rootPassword,
            repairCommands,
            30000
        )
        const success = output.includes('GATEWAY_OK')

        if (success && agent[0].status === agentStatus.configuring) {
            await db
                .update(agents)
                .set({ status: agentStatus.running })
                .where(eq(agents.id, id))
        }

        if (success) return ok(c, null, t('api.repairSuccess'))

        return fail(c, t('api.repairGatewayNotResponding'), 500)
    } catch (error) {
        console.error('repairAgent', error)
        return fail(c, t('api.failedToRepairClaw'), 500)
    }
}

export default repairAgent