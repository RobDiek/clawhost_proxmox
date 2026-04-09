import executeSSH from '@/services/ssh'
import { WHATSAPP_PATHS, withClaw } from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'

const pairWhatsAppStatus = withErrorHandler(
    'pairWhatsAppStatus',
    'api.whatsappPairFailed'
)(
    withClaw({ requireSSH: 'api.whatsappPairFailed' })(async (c, claw) => {
        try {
            const output = await executeSSH(
                claw.ip!,
                claw.rootPassword!,
                [
                    `ls ${WHATSAPP_PATHS.CREDS_DIR}/*/creds.json 2>/dev/null && echo "STATUS:CREDS_FOUND" || echo "STATUS:NO_CREDS"`,
                    `echo "===SEPARATOR==="`,
                    `cat ${WHATSAPP_PATHS.PAIR_LOG} 2>/dev/null || echo "STATUS:NO_LOG"`,
                    `echo "===SEPARATOR==="`,
                    `test -f ${WHATSAPP_PATHS.PAIR_PID} && kill -0 $(cat ${WHATSAPP_PATHS.PAIR_PID}) 2>/dev/null && echo "STATUS:RUNNING" || echo "STATUS:NOT_RUNNING"`,
                    `echo "===SEPARATOR==="`,
                    `test -f ${WHATSAPP_PATHS.PAIR_LOG} && echo "STATUS:LOG_EXISTS" || echo "STATUS:NO_LOG_FILE"`
                ].join('; '),
                8000
            )

            const sections = output
                .split('===SEPARATOR===')
                .map((s) => s.trim())
            const credsSection = sections[0] || ''
            const logSection = sections[1] || ''
            const pidSection = sections[2] || ''
            const logFileSection = sections[3] || ''

            if (credsSection.includes('STATUS:CREDS_FOUND')) {
                await executeSSH(
                    claw.ip!,
                    claw.rootPassword!,
                    `kill $(cat ${WHATSAPP_PATHS.PAIR_PID} 2>/dev/null) 2>/dev/null; rm -f ${WHATSAPP_PATHS.PAIR_LOG} ${WHATSAPP_PATHS.PAIR_PID}`,
                    5000
                ).catch(() => {})
                return ok(c, { status: 'paired' })
            }

            const isRunning = pidSection.includes('STATUS:RUNNING')
            const logExists = logFileSection.includes('STATUS:LOG_EXISTS')
            const hasLogContent =
                !logSection.includes('STATUS:NO_LOG') && logSection.length > 0

            if (!logExists) return ok(c, { status: 'waiting' })

            if (hasLogContent) {
                const logLines = logSection.split('\n')
                const qrPattern =
                    /[\u2580\u2584\u2588\u258C\u2590\u2591\u2592\u2593\u25A0\u25A1\u25AA\u25AB\u2503\u2501\u250F\u2513\u2517\u251B\u2B1B\u2B1C]/
                let lastQrEnd = -1
                for (let i = logLines.length - 1; i >= 0; i--) {
                    if (qrPattern.test(logLines[i])) {
                        lastQrEnd = i
                        break
                    }
                }

                if (lastQrEnd >= 0) {
                    let lastQrStart = lastQrEnd
                    for (let i = lastQrEnd - 1; i >= 0; i--) {
                        if (!qrPattern.test(logLines[i])) break
                        lastQrStart = i
                    }
                    const lastQrLines = logLines.slice(
                        lastQrStart,
                        lastQrEnd + 1
                    )
                    if (lastQrLines.length > 5) {
                        return ok(c, {
                            status: 'qr_ready',
                            qr: lastQrLines.join('\n')
                        })
                    }
                }

                const scanLine = logLines.find((line) =>
                    /scan|qr|link.*device|pair/i.test(line)
                )
                if (scanLine) {
                    const qrBlock = logLines.filter(
                        (line) =>
                            line.trim().length > 10 &&
                            !/^[\w\s:.,[\](){}/<>-]+$/.test(line)
                    )
                    if (qrBlock.length > 5) {
                        return ok(c, {
                            status: 'qr_ready',
                            qr: qrBlock.join('\n')
                        })
                    }
                }
            }

            if (!isRunning && hasLogContent) {
                return ok(c, {
                    status: 'failed',
                    log: logSection.slice(0, 500)
                })
            }

            return ok(c, { status: 'waiting' })
        } catch {
            return fail(c, t('api.whatsappPairFailed'), 500)
        }
    })
)

export default pairWhatsAppStatus