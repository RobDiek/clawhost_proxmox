import type { AuthenticatedContext } from '@/ts/Types'
import type {
    InstallVersionBody,
    NpmRegistryTimeResponse
} from '@/ts/Interfaces'

import { eq } from 'drizzle-orm'
import { externalUrls } from '@openclaw/shared'
import { db } from '@/db'
import { claws } from '@/db/schema'
import executeSSH from '@/services/ssh'
import { invalidateVersionCache } from '@/controllers/claws/helpers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

const VERSION_REGEX = /^[a-zA-Z0-9._-]+$/
const OUTDATED_CUTOFF = new Date('2026-02-01')
const NPM_REGISTRY_URL = externalUrls.NPM.REGISTRY('openclaw')

const installClawVersion = async (c: AuthenticatedContext) => {
    try {
        const id = c.req.param('id')!
        const { version } = await c.req.json<InstallVersionBody>()

        if (!version || !VERSION_REGEX.test(version)) {
            return fail(c, t('api.invalidVersion'), 400)
        }

        const [registryResponse, clawResult] = await Promise.all([
            fetch(NPM_REGISTRY_URL, {
                headers: { Accept: 'application/json' }
            }),
            db.select().from(claws).where(eq(claws.id, id)).limit(1)
        ])

        if (registryResponse.ok) {
            const registry =
                (await registryResponse.json()) as NpmRegistryTimeResponse
            const publishedAt = registry.time?.[version]
            if (publishedAt && new Date(publishedAt) < OUTDATED_CUTOFF) {
                return fail(c, t('api.outdatedVersion'), 400)
            }
        }

        const claw = clawResult

        if (!claw[0]) return fail(c, t('api.clawNotFound'), 404)

        if (!claw[0].ip || !claw[0].rootPassword)
            return fail(c, t('api.failedToInstallVersion'), 400)

        const installCommands = [
            'systemctl stop openclaw-gateway || true',
            `npm install -g openclaw@${version}`,
            'su - openclaw -c "openclaw doctor --fix" || true',
            'systemctl restart openclaw-gateway',
            'sleep 15',
            'curl -sf -o /dev/null --max-time 5 http://127.0.0.1:18789 && echo "GATEWAY_OK" || echo "GATEWAY_FAILED"'
        ].join(' && ')

        const output = await executeSSH(
            claw[0].ip,
            claw[0].rootPassword,
            installCommands,
            120000
        )

        invalidateVersionCache(claw[0].ip)

        const success = output.includes('GATEWAY_OK')

        if (success) return ok(c, { version }, t('api.installVersionSuccess'))

        return fail(c, t('api.failedToInstallVersion'), 500)
    } catch (error) {
        console.error('installClawVersion', error)
        return fail(
            c,
            error instanceof Error
                ? error.message
                : t('api.failedToInstallVersion'),
            500
        )
    }
}

export default installClawVersion