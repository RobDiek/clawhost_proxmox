/**
 * Application-layer encryption for secrets at rest (Phase 0 risk hygiene).
 *
 * AES-256-GCM with a key from `SECRETS_ENCRYPTION_KEY` (apps/api/.env, NOT the DB).
 * A central Postgres dump alone therefore yields ciphertext, not usable secrets.
 *
 * Format: `enc:v1:` + base64(iv[12] | authTag[16] | ciphertext). The prefix makes
 * encryption detectable, so decryptSecret() transparently passes through legacy
 * plaintext — values can be migrated lazily / backfilled without a flag day.
 *
 * Fail-open by design: if the key is absent (local dev / CI), encryptSecret() is a
 * no-op (warns once) so the app keeps working; decryptSecret() of an *encrypted*
 * value with no key throws loudly (that is a misconfiguration, not legacy data).
 *
 * See roadmap/16-tenant-sovereignty-architecture.md (Phase 0). Used by the
 * encryptedText / encryptedJsonb Drizzle column types in db/encryptedColumn.ts.
 */
import crypto from 'crypto'

const PREFIX = 'enc:v1:'
const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

let keyCache: Buffer | null = null
let warnedNoKey = false

const getKey = (): Buffer | null => {
    if (keyCache) return keyCache
    const raw = process.env.SECRETS_ENCRYPTION_KEY
    if (!raw) return null
    const buf = /^[0-9a-fA-F]{64}$/.test(raw)
        ? Buffer.from(raw, 'hex')
        : Buffer.from(raw, 'base64')
    if (buf.length !== 32) {
        throw new Error(
            'SECRETS_ENCRYPTION_KEY must decode to 32 bytes (64 hex chars or base64 of 32 bytes)'
        )
    }
    keyCache = buf
    return keyCache
}

export const isEncrypted = (value: unknown): value is string =>
    typeof value === 'string' && value.startsWith(PREFIX)

export const encryptSecret = (plaintext: string): string => {
    if (isEncrypted(plaintext)) return plaintext
    const key = getKey()
    if (!key) {
        if (!warnedNoKey) {
            console.warn(
                '[secretCrypto] SECRETS_ENCRYPTION_KEY not set — secrets stored WITHOUT encryption'
            )
            warnedNoKey = true
        }
        return plaintext
    }
    const iv = crypto.randomBytes(IV_LEN)
    const cipher = crypto.createCipheriv(ALGO, key, iv)
    const enc = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
    ])
    const tag = cipher.getAuthTag()
    return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64')
}

export const decryptSecret = (value: string): string => {
    if (!isEncrypted(value)) return value
    const key = getKey()
    if (!key) {
        throw new Error(
            '[secretCrypto] encrypted value present but SECRETS_ENCRYPTION_KEY is not set'
        )
    }
    const raw = Buffer.from(value.slice(PREFIX.length), 'base64')
    const iv = raw.subarray(0, IV_LEN)
    const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN)
    const enc = raw.subarray(IV_LEN + TAG_LEN)
    const decipher = crypto.createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
        'utf8'
    )
}