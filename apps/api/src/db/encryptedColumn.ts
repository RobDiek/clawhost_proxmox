/**
 * Drizzle column types that transparently encrypt secrets at rest (Phase 0).
 *
 * Swapping a secret column from `text(...)`/`jsonb(...)` to these encrypts on every
 * ORM write and decrypts on every ORM read — no call-site changes, and no DB column
 * type change (encryptedText is still `text`, encryptedJsonb is still `jsonb`).
 *
 * Backward compatible: decrypt passes through legacy plaintext, so existing rows
 * keep working until the backfill (scripts/encrypt-secrets-backfill.ts) runs.
 *
 * jsonb encoding: the object is JSON-stringified, encrypted, and stored as a jsonb
 * *string scalar* ("enc:v1:..."). Legacy rows hold a jsonb object and read back as-is.
 *
 * NOTE: raw SQL that reads these columns bypasses decryption — none currently does
 * (verified 2026-06-09); any new raw-SQL access must call decryptSecret() itself.
 */
import { customType } from 'drizzle-orm/pg-core'
import { encryptSecret, decryptSecret } from '@/services/secretCrypto'

export const encryptedText = customType<{ data: string; driverData: string }>({
    dataType() {
        return 'text'
    },
    toDriver(value: string): string {
        return encryptSecret(value)
    },
    fromDriver(value: string): string {
        return decryptSecret(value)
    }
})

export const encryptedJsonb = customType<{
    data: unknown
    driverData: unknown
}>({
    dataType() {
        return 'jsonb'
    },
    toDriver(value: unknown): string {
        return JSON.stringify(encryptSecret(JSON.stringify(value)))
    },
    fromDriver(value: unknown): unknown {
        if (typeof value === 'string') {
            return JSON.parse(decryptSecret(value))
        }
        return value
    }
})