import type { Context } from 'hono'
import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { referrals, instances, users } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { randomBytes } from 'crypto'

function generateCode(): string {
    return 'CF-' + randomBytes(4).toString('base64url').toUpperCase().slice(0, 8)
}

// Helper: get userId from JWT
function resolveUserId(c: Context): string | null {
    return c.get('userId') || null
}

// GET /referral/my-code — get or create referral code for current user
export const getMyReferralCode = async (c: Context) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized', 401)

        // Check if user already has a referral code
        const existing = await db.select().from(referrals)
            .where(and(eq(referrals.referrerUserId, userId), eq(referrals.status, 'pending')))

        if (existing.length > 0) {
            return ok(c, {
                code: existing[0].referralCode,
                link: `https://clawflow.flowmatic.co.il/?ref=${existing[0].referralCode}`,
            }, 'Referral code')
        }

        // Create new code
        const code = generateCode()
        await db.insert(referrals).values({
            referrerUserId: userId,
            referralCode: code,
        })

        return ok(c, {
            code,
            link: `https://clawflow.flowmatic.co.il/?ref=${code}`,
        }, 'Referral code created')
    } catch (err) {
        console.error('getMyReferralCode error:', err)
        return fail(c, 'Failed to get referral code', 500)
    }
}

// GET /referral/my-referrals — list referrals for current user
export const getMyReferrals = async (c: Context) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized', 401)

        const refs = await db.select().from(referrals)
            .where(eq(referrals.referrerUserId, userId))

        const converted = refs.filter(r => r.status === 'converted' || r.status === 'rewarded').length
        const trial = refs.filter(r => r.status === 'trial_started').length
        const pending = refs.filter(r => r.status === 'pending').length

        return ok(c, {
            referrals: refs.map(r => ({
                email: r.refereeEmail ? r.refereeEmail.slice(0, 1) + '***' + r.refereeEmail.slice(r.refereeEmail.indexOf('@')) : null,
                status: r.status,
                trialStartedAt: r.trialStartedAt,
                convertedAt: r.convertedAt,
            })),
            stats: { converted, trial, pending, total: refs.length },
        }, 'Referrals')
    } catch (err) {
        console.error('getMyReferrals error:', err)
        return fail(c, 'Failed to get referrals', 500)
    }
}

// GET /referral/validate/:code — check if referral code is valid (public, no auth)
export const validateReferralCode = async (c: Context) => {
    try {
        const code = c.req.param('code')
        if (!code || !/^CF-[A-Z0-9_-]{6,8}$/.test(code)) {
            return ok(c, { valid: false }, 'Invalid code format')
        }

        const [ref] = await db.select().from(referrals)
            .where(eq(referrals.referralCode, code))

        if (!ref) return ok(c, { valid: false }, 'Code not found')

        return ok(c, { valid: true, code }, 'Valid referral code')
    } catch (err) {
        console.error('validateReferralCode error:', err)
        return ok(c, { valid: false }, 'Error')
    }
}

// POST /referral/activate — activate trial for new user (requires auth)
export const activateReferralTrial = async (c: Context) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized', 401)

        const body = await c.req.json<{
            referralCode: string
            instanceId: string
        }>()

        if (!body.referralCode || !body.instanceId) {
            return fail(c, 'Referral code and instance ID required', 400)
        }

        // Verify user owns this instance
        const [instance] = await db.select().from(instances)
            .where(and(eq(instances.id, body.instanceId), eq(instances.userId, userId)))
        if (!instance) return fail(c, 'Instance not found', 404)

        // Prevent self-referral
        const [ref] = await db.select().from(referrals)
            .where(eq(referrals.referralCode, body.referralCode))
        if (!ref) return fail(c, 'Invalid referral code', 400)
        if (ref.referrerUserId === userId) return fail(c, 'Cannot use your own referral code', 400)

        // Check referral not already used
        if (ref.status !== 'pending') return fail(c, 'Referral code already used', 400)

        // Get user email
        const [user] = await db.select().from(users).where(eq(users.id, userId))

        // Update referral with trial info
        await db.update(referrals).set({
            refereeEmail: user?.email || null,
            refereeUserId: userId,
            trialInstanceId: body.instanceId,
            status: 'trial_started',
            trialStartedAt: new Date(),
        }).where(and(eq(referrals.id, ref.id), eq(referrals.status, 'pending'))) // optimistic lock

        // Set trial on instance (14 days)
        const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        await db.update(instances).set({
            status: 'trial',
            trialEndsAt,
        }).where(eq(instances.id, body.instanceId))

        return ok(c, { trialEndsAt }, 'Trial activated — 14 days free')
    } catch (err) {
        console.error('activateReferralTrial error:', err)
        return fail(c, 'Failed to activate trial', 500)
    }
}

// Called from billing webhook when trial user pays
export async function rewardReferrer(instanceId: string): Promise<void> {
    try {
        // Atomic check + update to prevent double-reward
        const updated = await db.update(referrals).set({
            status: 'converted',
            convertedAt: new Date(),
        }).where(and(
            eq(referrals.trialInstanceId, instanceId),
            eq(referrals.status, 'trial_started') // only from trial_started
        )).returning()

        if (!updated.length) return // already converted or not found
        const ref = updated[0]

        // Find referrer's instance and add 30 free days
        const referrerInstances = await db.select().from(instances)
            .where(eq(instances.userId, ref.referrerUserId))

        if (referrerInstances.length > 0) {
            const inst = referrerInstances[0]
            const currentFreeUntil = inst.freeUntil || new Date()
            const base = currentFreeUntil > new Date() ? currentFreeUntil : new Date()
            const newFreeUntil = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000)

            await db.update(instances).set({ freeUntil: newFreeUntil })
                .where(eq(instances.id, inst.id))

            // Notify referrer
            if (inst.telegramChatId) {
                const telegram = (await import('@/services/telegram')).default
                await telegram.sendMessage(inst.telegramChatId,
                    '🎉 חבר שלך הצטרף ל-ClawFlow! קיבלת חודש נוסף בחינם.').catch(() => {})
            }
        }

        // Mark rewarded
        await db.update(referrals).set({
            status: 'rewarded',
            rewardedAt: new Date(),
        }).where(eq(referrals.id, ref.id))

        console.log(`Referral reward: referrer ${ref.referrerUserId} got 30 free days for instance ${instanceId}`)
    } catch (err) {
        console.error('rewardReferrer error:', err)
    }
}
