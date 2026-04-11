import type { UpdateClawSubdomainBody } from '@/ts/Interfaces'
import type { AuthenticatedContext } from '@/ts/Types'

import { eq, and, ne } from 'drizzle-orm'
import { inputValidation, clawStatus } from '@openclaw/shared'
import { db } from '@/db'
import { claws } from '@/db/schema'
import cloudflare from '@/services/cloudflare'
import executeSSH from '@/services/ssh'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import withErrorHandler from '@/lib/withErrorHandler'
import {
    findUserClaw,
    sanitizeClaw,
    safeShellWrite,
    DOMAIN
} from '@/controllers/agents/helpers'

const SUBDOMAIN_CHANGE_WINDOW = 86_400_000

const generateNginxConfig = (fullDomain: string): string => {
    return `map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 444;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${fullDomain};

    location / {
        proxy_pass http://127.0.0.1:18789;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}`
}

const updateClawSubdomain = withErrorHandler('updateClawSubdomain')(async (
    c: AuthenticatedContext
) => {
    const userId = c.get('userId')
    const id = c.req.param('id')!
    const body = await c.req.json<UpdateClawSubdomainBody>()

    const subdomain = body.subdomain?.trim().toLowerCase()

    if (!subdomain) return fail(c, t('api.invalidSubdomain'), 400)

    const subdomainRegex = new RegExp(
        `^[a-z0-9]{${inputValidation.SUBDOMAIN.MIN},${inputValidation.SUBDOMAIN.MAX}}$`
    )
    if (!subdomainRegex.test(subdomain)) return fail(c, t('api.invalidSubdomain'), 400)

    const claw = await findUserClaw(userId, id, c.get('isAdmin'))
    if (!claw) return fail(c, t('api.clawNotFound'), 404)

    if (claw.status !== clawStatus.running)
        return fail(c, t('api.clawBusy'), 400)

    if (!claw.ip || !claw.rootPassword || !claw.subdomain)
        return fail(c, t('api.clawBusy'), 400)

    if (subdomain === claw.subdomain) return ok(c, sanitizeClaw(claw))

    if (!c.get('isAdmin') && claw.lastSubdomainChangedAt) {
        const elapsed = Date.now() - claw.lastSubdomainChangedAt.getTime()
        if (elapsed < SUBDOMAIN_CHANGE_WINDOW)
            return fail(c, t('api.subdomainRateLimited'), 429)
    }

    const [existing] = await db
        .select({ id: claws.id })
        .from(claws)
        .where(and(eq(claws.subdomain, subdomain), ne(claws.id, id)))
        .limit(1)

    if (existing) return fail(c, t('api.subdomainAlreadyInUse'), 409)

    const oldSubdomain = claw.subdomain
    const fullDomain = `${subdomain}.${DOMAIN}`

    const oldRecord = await cloudflare.findDNSRecord(oldSubdomain)
    if (oldRecord) await cloudflare.deleteDNSRecord(oldRecord.id)

    await cloudflare.createDNSRecord(subdomain, claw.ip)

    const nginxConfig = generateNginxConfig(fullDomain)
    await safeShellWrite(
        claw.ip,
        claw.rootPassword,
        '/etc/nginx/sites-available/openclaw',
        nginxConfig,
        15000
    )

    await executeSSH(
        claw.ip,
        claw.rootPassword,
        [
            'certbot delete --cert-name ' + `${oldSubdomain}.${DOMAIN}` + ' --non-interactive 2>/dev/null || true',
            'nginx -t && systemctl reload nginx',
            'for i in $(seq 1 24); do if host ' + fullDomain + ' 1.1.1.1 > /dev/null 2>&1; then sleep 15; break; fi; sleep 5; done',
            'certbot --nginx -d ' + fullDomain + ' --non-interactive --agree-tos --email ssl@' + DOMAIN + ' --redirect'
        ].join(' && '),
        120000
    )

    await db
        .update(claws)
        .set({
            subdomain,
            lastSubdomainChangedAt: new Date()
        })
        .where(eq(claws.id, id))

    const updated = { ...claw, subdomain, lastSubdomainChangedAt: new Date() }

    return ok(c, sanitizeClaw(updated), t('api.subdomainUpdated'))
})

export default updateClawSubdomain