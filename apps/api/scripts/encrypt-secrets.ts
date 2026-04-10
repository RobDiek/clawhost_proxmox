import 'dotenv/config'

import crypto from 'crypto'
import { Client } from 'ssh2'
import { db } from '@/db'
import { claws, pendingClaws } from '@/db/schema'
import { encrypt, decrypt } from '@/lib/encryption'
import { eq } from 'drizzle-orm'

const DRY_RUN = !process.argv.includes('--apply')
const CAPTURE_HOST_KEYS = process.argv.includes('--capture-host-keys')

const log = (msg: string) => process.stdout.write(`${msg}\n`)

const isEncrypted = (value: string): boolean => value.startsWith('enc:')

const captureHostKey = (
    ip: string,
    password: string
): Promise<string | null> => {
    return new Promise((resolve) => {
        const conn = new Client()
        const timeout = setTimeout(() => {
            conn.end()
            resolve(null)
        }, 10000)

        conn.on('ready', () => {
            clearTimeout(timeout)
            conn.end()
        })

        conn.on('error', () => {
            clearTimeout(timeout)
            resolve(null)
        })

        conn.connect({
            host: ip,
            port: 22,
            username: 'root',
            password,
            readyTimeout: 10000,
            algorithms: {
                serverHostKey: ['ssh-ed25519', 'ssh-rsa', 'ecdsa-sha2-nistp256']
            },
            hostVerifier: (key: Buffer) => {
                const fingerprint = crypto
                    .createHash('sha256')
                    .update(key)
                    .digest('hex')
                clearTimeout(timeout)
                conn.end()
                resolve(fingerprint)
                return true
            }
        })
    })
}

const run = async () => {
    if (!process.env.ENCRYPTION_KEY) {
        log('ERROR: ENCRYPTION_KEY not set. Generate one with:')
        log(
            "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
        )
        process.exit(1)
    }

    log(
        `\n=== Encrypt Secrets Migration (${DRY_RUN ? 'DRY RUN' : 'APPLYING'}) ===\n`
    )

    const allClaws = await db.select().from(claws)
    const allPending = await db.select().from(pendingClaws)

    let clawsEncrypted = 0
    let clawsAlreadyEncrypted = 0
    let pendingEncrypted = 0
    let hostKeysCaptured = 0
    let hostKeysExisting = 0
    let hostKeysFailed = 0

    log(`Found ${allClaws.length} claws, ${allPending.length} pending claws\n`)

    for (const claw of allClaws) {
        const needsRootPw = claw.rootPassword && !isEncrypted(claw.rootPassword)
        const needsGateway =
            claw.gatewayToken && !isEncrypted(claw.gatewayToken)

        if (needsRootPw || needsGateway) {
            log(`  [ENCRYPT] Claw "${claw.name}" (${claw.id})`)

            if (!DRY_RUN) {
                await db
                    .update(claws)
                    .set({
                        ...(needsRootPw
                            ? { rootPassword: encrypt(claw.rootPassword!) }
                            : {}),
                        ...(needsGateway
                            ? { gatewayToken: encrypt(claw.gatewayToken!) }
                            : {})
                    })
                    .where(eq(claws.id, claw.id))
            }
            clawsEncrypted++
        } else {
            clawsAlreadyEncrypted++
        }

        if (claw.hostKeyFingerprint) {
            hostKeysExisting++
        } else if (CAPTURE_HOST_KEYS && claw.ip && claw.rootPassword) {
            const password = isEncrypted(claw.rootPassword)
                ? decrypt(claw.rootPassword)
                : claw.rootPassword
            log(`  [HOST KEY] Capturing for "${claw.name}" (${claw.ip})...`)
            const fingerprint = await captureHostKey(claw.ip, password)

            if (fingerprint) {
                log(`    -> ${fingerprint.slice(0, 16)}...`)
                if (!DRY_RUN) {
                    await db
                        .update(claws)
                        .set({ hostKeyFingerprint: fingerprint })
                        .where(eq(claws.id, claw.id))
                }
                hostKeysCaptured++
            } else {
                log(`    -> FAILED (server unreachable)`)
                hostKeysFailed++
            }
        }
    }

    for (const pending of allPending) {
        if (pending.rootPassword && !isEncrypted(pending.rootPassword)) {
            log(`  [ENCRYPT] Pending "${pending.name}" (${pending.id})`)

            if (!DRY_RUN) {
                await db
                    .update(pendingClaws)
                    .set({ rootPassword: encrypt(pending.rootPassword) })
                    .where(eq(pendingClaws.id, pending.id))
            }
            pendingEncrypted++
        }
    }

    log('\n=== Summary ===')
    log(`  Claws encrypted: ${clawsEncrypted}`)
    log(`  Claws already encrypted: ${clawsAlreadyEncrypted}`)
    log(`  Pending claws encrypted: ${pendingEncrypted}`)
    if (CAPTURE_HOST_KEYS) {
        log(`  Host keys captured: ${hostKeysCaptured}`)
        log(`  Host keys already stored: ${hostKeysExisting}`)
        log(`  Host keys failed: ${hostKeysFailed}`)
    }

    if (DRY_RUN) {
        log('\nThis was a dry run. Use --apply to execute changes.')
        if (!CAPTURE_HOST_KEYS) {
            log(
                'Add --capture-host-keys to also capture SSH host key fingerprints.'
            )
        }
    }

    log('')
    process.exit(0)
}

run().catch((error) => {
    console.error('encrypt-secrets', error)
    process.exit(1)
})