import { withClaw, DOMAIN } from '@/controllers/agents/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import executeSSH from '@/services/ssh'

const enablePreview = withClaw({ requireSSH: 'api.failedToEnablePreview' })(
    async (c, claw) => {
        try {
            const command = `grep -q 'frame-ancestors' /etc/nginx/sites-available/openclaw || (sed -i '/proxy_send_timeout/a\\            add_header Content-Security-Policy "frame-ancestors https://${DOMAIN} https://*.${DOMAIN}" always;' /etc/nginx/sites-available/openclaw && nginx -t && systemctl reload nginx)`

            await executeSSH(claw.ip!, claw.rootPassword!, command)

            return ok(c, null, t('api.enablePreviewSuccess'))
        } catch (error) {
            console.error('enablePreview', error)
            return fail(
                c,
                error instanceof Error
                    ? error.message
                    : t('api.failedToEnablePreview'),
                500
            )
        }
    }
)

export default enablePreview