import type { RotateGatewayTokenBody } from '@/ts/Interfaces'

import { eq } from 'drizzle-orm'
import { t } from '@openclaw/i18n'
import { inputValidation } from '@openclaw/shared'
import { db } from '@/db'
import { claws } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import executeSSH from '@/services/ssh'
import { encrypt } from '@/lib/encryption'
import { withClaw, generateToken } from '@/controllers/agents/helpers'

const CONFIG_PATH = '/home/openclaw/.openclaw/openclaw.json'

const rotateGatewayToken = withClaw({
    requireSSH: 'api.failedToRotateGatewayToken'
})(async (c, claw) => {
    try {
        const body = await c.req
            .json<RotateGatewayTokenBody>()
            .catch(() => ({}) as RotateGatewayTokenBody)
        const newToken = body.token || generateToken()

        if (
            newToken.length < inputValidation.GATEWAY_TOKEN.MIN ||
            newToken.length > inputValidation.GATEWAY_TOKEN.MAX
        ) return fail(c, t('api.invalidGatewayToken', {
            min: inputValidation.GATEWAY_TOKEN.MIN,
            max: inputValidation.GATEWAY_TOKEN.MAX
        }), 400)

        const tokenBase64 = Buffer.from(newToken).toString('base64')

        const updateCommand = [
            `export TOKEN=$(echo '${tokenBase64}' | base64 -d)`,
            `&& node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('${CONFIG_PATH}','utf8'));j.gateway.auth.token=process.env.TOKEN;j.gateway.remote.token=process.env.TOKEN;fs.writeFileSync('${CONFIG_PATH}',JSON.stringify(j,null,2))"`,
            `&& chown openclaw:openclaw ${CONFIG_PATH}`,
            '&& systemctl restart openclaw-gateway'
        ].join(' ')

        const oldEncryptedToken = claw.gatewayToken
            ? encrypt(claw.gatewayToken)
            : claw.gatewayToken

        await db
            .update(claws)
            .set({ gatewayToken: encrypt(newToken) })
            .where(eq(claws.id, claw.id))

        try {
            await executeSSH(claw.ip!, claw.rootPassword!, updateCommand, 30000)
        } catch (sshError) {
            if (oldEncryptedToken) {
                await db
                    .update(claws)
                    .set({ gatewayToken: oldEncryptedToken })
                    .where(eq(claws.id, claw.id))
            }
            throw sshError
        }

        return ok(c, { rotated: true }, t('api.gatewayTokenRotated'))
    } catch (error) {
        console.error('rotateGatewayToken', error)
        return fail(c, t('api.failedToRotateGatewayToken'), 500)
    }
})

export default rotateGatewayToken