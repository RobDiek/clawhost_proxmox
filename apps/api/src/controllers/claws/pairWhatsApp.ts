import type { AuthenticatedContext } from '@/ts/Types'

import executeSSH from '@/services/ssh'
import {
    findUserClaw,
    WHATSAPP_PATHS,
    checkFeatureVersion
} from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const pairWhatsApp = async (c: AuthenticatedContext) => {
    try {
        const userId = c.get('userId')
        const id = c.req.param('id')!
        const claw = await findUserClaw(userId, id)

        if (!claw) {
            return fail(c, t('api.clawNotFound'), 404)
        }

        if (!claw.ip || !claw.rootPassword) {
            return fail(c, t('api.whatsappPairFailed'), 400)
        }

        try {
            const { supported, version } = await checkFeatureVersion(
                claw.ip,
                claw.rootPassword,
                'channels'
            )

            if (!supported) {
                return fail(
                    c,
                    t('api.featureVersionUnsupported', { version }),
                    400,
                    { version }
                )
            }

            const credsCheck = await executeSSH(
                claw.ip,
                claw.rootPassword,
                `ls ${WHATSAPP_PATHS.CREDS_DIR}/*/creds.json 2>/dev/null && echo "HAS_CREDS" || echo "NO_CREDS"`,
                5000
            )

            const force = c.req.query('force') === 'true'

            if (credsCheck.includes('HAS_CREDS') && !force) {
                return ok(
                    c,
                    { status: 'already_paired' },
                    t('api.whatsappAlreadyPaired')
                )
            }

            if (credsCheck.includes('HAS_CREDS') && force) {
                await executeSSH(
                    claw.ip,
                    claw.rootPassword,
                    `rm -rf ${WHATSAPP_PATHS.CREDS_DIR}`,
                    5000
                )
            }

            await executeSSH(
                claw.ip,
                claw.rootPassword,
                'su - openclaw -c "openclaw channels add --channel whatsapp" 2>&1',
                15000
            )

            await executeSSH(
                claw.ip,
                claw.rootPassword,
                `kill $(cat ${WHATSAPP_PATHS.PAIR_PID} 2>/dev/null) 2>/dev/null; rm -f ${WHATSAPP_PATHS.PAIR_LOG} ${WHATSAPP_PATHS.PAIR_PID} ${WHATSAPP_PATHS.PAIR_SCRIPT}`,
                5000
            ).catch(() => {})

            await executeSSH(
                claw.ip,
                claw.rootPassword,
                `cat > ${WHATSAPP_PATHS.PAIR_SCRIPT} << 'PAIREOF'\n#!/bin/bash\nscript -qfc 'su - openclaw -c "openclaw channels login --channel whatsapp"' ${WHATSAPP_PATHS.PAIR_LOG}\nPAIREOF\nchmod +x ${WHATSAPP_PATHS.PAIR_SCRIPT}`,
                5000
            )

            await executeSSH(
                claw.ip,
                claw.rootPassword,
                `nohup ${WHATSAPP_PATHS.PAIR_SCRIPT} < /dev/null > /dev/null 2>&1 & echo $! > ${WHATSAPP_PATHS.PAIR_PID}; sleep 3`,
                15000
            )

            return ok(c, { status: 'started' }, t('api.whatsappPairStarted'))
        } catch {
            return fail(c, t('api.whatsappPairFailed'), 500)
        }
    } catch {
        return fail(c, t('api.whatsappPairFailed'), 500)
    }
}

export default pairWhatsApp