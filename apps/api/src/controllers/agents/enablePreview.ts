import { withClaw, DOMAIN } from '@/controllers/agents/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import executeSSH from '@/services/ssh'

const enablePreview = withClaw({ requireSSH: 'api.failedToEnablePreview' })(
    async (c, claw) => {
        try {
            const checkOnly = c.req.query('check') === 'true'

            const checkResult = await executeSSH(
                claw.ip!,
                claw.rootPassword!,
                "grep -q 'proxy_hide_header Content-Security-Policy' /etc/nginx/sites-available/openclaw && grep -q 'localhost' /etc/nginx/sites-available/openclaw && echo 'ENABLED' || echo 'DISABLED'"
            )

            const alreadyEnabled = checkResult.trim() === 'ENABLED'

            if (alreadyEnabled || checkOnly)
                return ok(c, { enabled: alreadyEnabled })

            const patchLines = [
                'proxy_hide_header Content-Security-Policy;',
                'proxy_hide_header X-Frame-Options;',
                `add_header Content-Security-Policy "frame-ancestors https://${DOMAIN} https://*.${DOMAIN} http://localhost:* https://localhost:*" always;`
            ]
                .map((line) => `            ${line}`)
                .join('\\n')

            const command = [
                "sed -i '/proxy_hide_header Content-Security-Policy/d; /proxy_hide_header X-Frame-Options/d; /frame-ancestors/d' /etc/nginx/sites-available/openclaw",
                `sed -i 's|proxy_send_timeout 86400;|proxy_send_timeout 86400;\\n${patchLines}|g' /etc/nginx/sites-available/openclaw`,
                'nginx -t && systemctl reload nginx'
            ].join(' && ')

            await executeSSH(claw.ip!, claw.rootPassword!, command)

            return ok(c, { enabled: true }, t('api.enablePreviewSuccess'))
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