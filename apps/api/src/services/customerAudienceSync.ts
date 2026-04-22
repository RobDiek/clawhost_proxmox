/**
 * Customer Audience Sync (Phase 3.2).
 *
 * Push customer email lists into the ad platforms so paid campaigns can:
 *   - EXCLUDE existing customers from cold campaigns (stop paying for
 *     people who already bought)
 *   - SEED lookalikes from top 10% revenue customers
 *   - INCLUDE retargeting audiences from trial/abandon cohorts
 *
 * Triggered from:
 *   - AllPay billing webhook (on `payment_success` → add customer to
 *     existing_customers list)
 *   - Manual sync button in dashboard (full re-upload)
 *
 * Email hashing: all emails are SHA-256 hashed before upload (Meta + Google
 * both require this). Lowercase + trim whitespace first per spec.
 *
 * Real API implementations land when OAuth is verified on both platforms.
 * Until then, these helpers write to a local log table (TODO) so the
 * mazhir agent can read them and take manual action on next campaign launch.
 */
import { createHash } from 'crypto'
import { eq, and } from 'drizzle-orm'

import { db } from '@/db'
import { instances, agentIntegrations } from '@/db/schema'

export type Cohort = 'existing_customer' | 'trial_user' | 'high_value' | 'abandon_cart'

interface CustomerRecord {
    email: string
    phone?: string
    firstName?: string
    lastName?: string
    revenueIls?: number      // lifetime revenue — used to pick top 10%
    cohort: Cohort
}

// SHA-256 hash helper — Meta and Google both require lowercased-trimmed input.
function hashEmail(email: string): string {
    return createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
}

// ─── Meta Custom Audiences ──────────────────────────────────────────────────
// Docs: https://developers.facebook.com/docs/marketing-api/audiences/guides/custom-audiences
// Requires: ad_account_id, page access token with ads_management scope.
// Flow:
//   1. Find or create Custom Audience with descriptive name
//   2. POST /{audience_id}/users with hashed emails (max 10k per batch)
export async function syncMetaCustomAudience(
    instanceId: string,
    cohort: Cohort,
    customers: CustomerRecord[],
): Promise<{ ok: boolean; uploaded: number; audienceId?: string; error?: string }> {
    if (customers.length === 0) return { ok: true, uploaded: 0 }

    const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
    const metaTokens = (instance?.metaTokens as any) || {}
    if (!metaTokens?.accessToken || !metaTokens?.adAccountId) {
        return { ok: false, uploaded: 0, error: 'Meta ads not connected' }
    }

    const audienceName = cohortAudienceName(cohort)
    const adAccountId = metaTokens.adAccountId.startsWith('act_') ? metaTokens.adAccountId : `act_${metaTokens.adAccountId}`

    // Find or create the audience
    let audienceId: string | undefined
    try {
        const listRes = await fetch(
            `https://graph.facebook.com/v21.0/${adAccountId}/customaudiences?fields=id,name&limit=200&access_token=${metaTokens.accessToken}`,
        )
        if (listRes.ok) {
            const list = await listRes.json() as { data?: Array<{ id: string; name: string }> }
            const found = (list.data || []).find(a => a.name === audienceName)
            if (found) audienceId = found.id
        }
    } catch { /* will create */ }

    if (!audienceId) {
        const createRes = await fetch(`https://graph.facebook.com/v21.0/${adAccountId}/customaudiences`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: audienceName,
                description: `Auto-synced by Flowmatic — ${cohort}`,
                customer_file_source: 'USER_PROVIDED_ONLY',
                subtype: 'CUSTOM',
                access_token: metaTokens.accessToken,
            }),
        })
        const createJson = await createRes.json() as { id?: string; error?: any }
        if (!createRes.ok || !createJson.id) {
            return { ok: false, uploaded: 0, error: `Meta CA create: ${createJson.error?.message || createRes.status}` }
        }
        audienceId = createJson.id
    }

    // Upload hashed emails in batches of 10k (Meta limit)
    const hashed = customers.map(c => [hashEmail(c.email)])
    let uploaded = 0
    for (let i = 0; i < hashed.length; i += 10000) {
        const batch = hashed.slice(i, i + 10000)
        const uploadRes = await fetch(
            `https://graph.facebook.com/v21.0/${audienceId}/users?access_token=${metaTokens.accessToken}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    payload: { schema: ['EMAIL_SHA256'], data: batch },
                }),
            },
        )
        if (uploadRes.ok) {
            uploaded += batch.length
        } else {
            const errJson = await uploadRes.json().catch(() => ({})) as { error?: any }
            return { ok: false, uploaded, audienceId, error: `Meta CA upload: ${errJson.error?.message || uploadRes.status}` }
        }
    }
    return { ok: true, uploaded, audienceId }
}

// ─── Google Ads Customer Match ──────────────────────────────────────────────
// Docs: https://developers.google.com/google-ads/api/docs/remarketing/audience-types/customer-match
// Requires: googleTokens.refreshToken + googleAdsConfig.developerToken +
//           customerId + loginCustomerId (optional for MCC)
// Flow:
//   1. Create OfflineUserDataJob (type=CUSTOMER_MATCH_USER_LIST)
//   2. Add hashed emails as operations
//   3. Run the job
export async function syncGoogleCustomerMatch(
    instanceId: string,
    cohort: Cohort,
    customers: CustomerRecord[],
): Promise<{ ok: boolean; uploaded: number; listResourceName?: string; error?: string }> {
    if (customers.length === 0) return { ok: true, uploaded: 0 }

    // Stub: real implementation needs OAuth refresh + Google Ads REST client.
    // For now, save the intent to agent_integrations so the mazhir agent sees it
    // on next run and can execute manually (or auto via MCC once wired up).
    try {
        const [cfg] = await db.select().from(agentIntegrations).where(and(
            eq(agentIntegrations.instanceId, instanceId),
            eq(agentIntegrations.integrationType, 'google_customer_match_queue'),
        ))
        const existing = (cfg?.config as any) || { queue: [] }
        const queue = Array.isArray(existing.queue) ? existing.queue : []
        queue.push({
            cohort,
            hashedEmails: customers.map(c => hashEmail(c.email)),
            enqueuedAt: new Date().toISOString(),
        })
        // Keep last 10 queue entries so we don't bloat
        const trimmed = queue.slice(-10)
        if (cfg) {
            await db.update(agentIntegrations)
                .set({ config: { queue: trimmed } as any, updatedAt: new Date() })
                .where(eq(agentIntegrations.id, cfg.id))
        } else {
            await db.insert(agentIntegrations).values({
                instanceId,
                agentType: 'mt',
                integrationType: 'google_customer_match_queue',
                config: { queue: trimmed } as any,
                status: 'pending',
            })
        }
        return {
            ok: true,
            uploaded: customers.length,
            error: 'Queued — Google Ads OAuth not yet verified; mazhir agent will execute on next manual campaign launch',
        }
    } catch (err) {
        return { ok: false, uploaded: 0, error: (err as Error).message }
    }
}

// ─── Orchestrator: called from AllPay webhook + manual sync endpoint ────────
export async function syncCustomerToAudiences(
    instanceId: string,
    customer: CustomerRecord,
): Promise<{ meta: Awaited<ReturnType<typeof syncMetaCustomAudience>>; google: Awaited<ReturnType<typeof syncGoogleCustomerMatch>> }> {
    const [metaRes, googleRes] = await Promise.all([
        syncMetaCustomAudience(instanceId, customer.cohort, [customer]).catch(err => ({
            ok: false, uploaded: 0, error: (err as Error).message,
        })),
        syncGoogleCustomerMatch(instanceId, customer.cohort, [customer]).catch(err => ({
            ok: false, uploaded: 0, error: (err as Error).message,
        })),
    ])
    return { meta: metaRes, google: googleRes }
}

// Convenient naming so the mazhir agent's "Custom Audience: name" references
// line up with what actually exists on Meta.
function cohortAudienceName(cohort: Cohort): string {
    switch (cohort) {
        case 'existing_customer': return 'Flowmatic — Existing Customers (30d)'
        case 'trial_user': return 'Flowmatic — Trial Users'
        case 'high_value': return 'Flowmatic — High-Value Customers (top 10%)'
        case 'abandon_cart': return 'Flowmatic — Cart Abandoners'
    }
}