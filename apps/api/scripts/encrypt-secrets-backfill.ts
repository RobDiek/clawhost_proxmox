/**
 * Phase 0 backfill — encrypt existing plaintext secrets at rest.
 *
 * After the schema swap to encryptedText/encryptedJsonb, NEW writes are encrypted
 * and reads transparently decrypt (plaintext passes through). This one-off script
 * encrypts the EXISTING plaintext rows in instances + mateh_agents.
 *
 * Idempotent: skips values already encrypted (enc:v1: prefix / encrypted jsonb
 * string scalar). Safe to re-run.
 *
 * GATING (run order matters):
 *   1. Deploy the code that adds the encrypted column types FIRST (reads stay
 *      backward-compatible with plaintext).
 *   2. Set SECRETS_ENCRYPTION_KEY in apps/api/.env and BACK IT UP (losing it makes
 *      all secrets unrecoverable).
 *   3. Test on a non-critical instance (e.g. master 44f484a852) before the paying
 *      client.
 *   4. Run:  SECRETS_ENCRYPTION_KEY=... npx tsx scripts/encrypt-secrets-backfill.ts
 *
 * dfs_cache.response is intentionally NOT backfilled — entries are transient (TTL)
 * and self-encrypt on the next write.
 */
import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { encryptSecret, isEncrypted } from '@/services/secretCrypto'

if (!process.env.SECRETS_ENCRYPTION_KEY) {
    console.error('SECRETS_ENCRYPTION_KEY is required to run the backfill.')
    process.exit(1)
}

const TEXT_COLS_INSTANCES = [
    'openclaw_token',
    'automation_password',
    'root_password',
    'ai_provider_key',
    'openai_api_key',
    'fal_api_key',
    'elevenlabs_api_key',
    'dataforseo_key',
    'firecrawl_key',
    'telegram_bot_token',
    'telegram_webhook_secret'
]
const JSONB_COLS = [
    'google_tokens',
    'meta_tokens',
    'microsoft_tokens',
    'gsc_tokens',
    'github_config',
    'google_ads_config'
]
// mateh_agents has the same secrets minus root_password.
const TEXT_COLS_AGENTS = TEXT_COLS_INSTANCES.filter((c) => c !== 'root_password')

let textUpdated = 0
let jsonbUpdated = 0

// Optional staged rollout: ONLY_INSTANCE=<vps id> restricts the backfill to a
// single instance (instances.id / mateh_agents.vps_instance_id) so it can be
// verified on a non-critical instance before the rest.
const ONLY = process.env.ONLY_INSTANCE

const whereFilter = (filterCol: string) =>
    ONLY ? sql` AND ${sql.identifier(filterCol)} = ${ONLY}` : sql``

const backfillText = async (
    table: string,
    col: string,
    filterCol: string
) => {
    const rows = (await db.execute(
        sql`SELECT id, ${sql.identifier(col)} AS v FROM ${sql.identifier(table)} WHERE ${sql.identifier(col)} IS NOT NULL${whereFilter(filterCol)}`
    )) as unknown as { rows: Array<{ id: string; v: string }> }
    for (const r of rows.rows) {
        if (isEncrypted(r.v)) continue
        const enc = encryptSecret(r.v)
        await db.execute(
            sql`UPDATE ${sql.identifier(table)} SET ${sql.identifier(col)} = ${enc} WHERE id = ${r.id}`
        )
        textUpdated++
    }
}

const backfillJsonb = async (
    table: string,
    col: string,
    filterCol: string
) => {
    const rows = (await db.execute(
        sql`SELECT id, ${sql.identifier(col)} AS v FROM ${sql.identifier(table)} WHERE ${sql.identifier(col)} IS NOT NULL${whereFilter(filterCol)}`
    )) as unknown as { rows: Array<{ id: string; v: unknown }> }
    for (const r of rows.rows) {
        // Already-encrypted rows come back as a JSON string scalar (enc:v1:...).
        if (typeof r.v === 'string' && isEncrypted(r.v)) continue
        const enc = encryptSecret(JSON.stringify(r.v))
        await db.execute(
            sql`UPDATE ${sql.identifier(table)} SET ${sql.identifier(col)} = ${JSON.stringify(enc)}::jsonb WHERE id = ${r.id}`
        )
        jsonbUpdated++
    }
}

const main = async () => {
    if (ONLY) console.log(`Scoped to instance: ${ONLY}`)
    for (const col of TEXT_COLS_INSTANCES)
        await backfillText('instances', col, 'id')
    for (const col of JSONB_COLS) await backfillJsonb('instances', col, 'id')
    for (const col of TEXT_COLS_AGENTS)
        await backfillText('mateh_agents', col, 'vps_instance_id')
    for (const col of JSONB_COLS)
        await backfillJsonb('mateh_agents', col, 'vps_instance_id')
    console.log(
        `Backfill complete: ${textUpdated} text + ${jsonbUpdated} jsonb secret values encrypted.`
    )
    process.exit(0)
}

main().catch((err) => {
    console.error('Backfill failed:', err)
    process.exit(1)
})