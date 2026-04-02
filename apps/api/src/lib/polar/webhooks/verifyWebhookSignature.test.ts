import crypto from 'crypto'
import { verifyWebhookSignature } from '@/lib/polar/webhooks'

describe('verifyWebhookSignature', () => {
    const secret = 'test-secret-key'
    const payload = '{"type":"checkout.created"}'
    const webhookId = 'wh_123'
    const timestamp = '1700000000'

    const makeSignature = (s: string): string => {
        const signedContent = `${webhookId}.${timestamp}.${payload}`
        const sig = crypto
            .createHmac('sha256', Buffer.from(s))
            .update(signedContent)
            .digest('base64')
        return `v1,${sig}`
    }

    it('verifies valid signature with plain secret', () => {
        const signature = makeSignature(secret)
        expect(
            verifyWebhookSignature(
                payload,
                webhookId,
                timestamp,
                signature,
                secret
            )
        ).toBe(true)
    })

    it('rejects invalid signature', () => {
        expect(
            verifyWebhookSignature(
                payload,
                webhookId,
                timestamp,
                'v1,invalidsig',
                secret
            )
        ).toBe(false)
    })

    it('rejects empty signature header', () => {
        expect(
            verifyWebhookSignature(payload, webhookId, timestamp, '', secret)
        ).toBe(false)
    })

    it('rejects when payload is tampered', () => {
        const signature = makeSignature(secret)
        expect(
            verifyWebhookSignature(
                '{"tampered":true}',
                webhookId,
                timestamp,
                signature,
                secret
            )
        ).toBe(false)
    })

    it('rejects when webhookId is wrong', () => {
        const signature = makeSignature(secret)
        expect(
            verifyWebhookSignature(
                payload,
                'wrong_id',
                timestamp,
                signature,
                secret
            )
        ).toBe(false)
    })

    it('rejects when timestamp is wrong', () => {
        const signature = makeSignature(secret)
        expect(
            verifyWebhookSignature(
                payload,
                webhookId,
                '9999999999',
                signature,
                secret
            )
        ).toBe(false)
    })

    it('handles multiple signatures in header', () => {
        const validSig = makeSignature(secret)
        const multiSigs = `v1,invalidsig ${validSig}`
        expect(
            verifyWebhookSignature(
                payload,
                webhookId,
                timestamp,
                multiSigs,
                secret
            )
        ).toBe(true)
    })

    it('ignores non-v1 signatures', () => {
        const signedContent = `${webhookId}.${timestamp}.${payload}`
        const sig = crypto
            .createHmac('sha256', Buffer.from(secret))
            .update(signedContent)
            .digest('base64')
        expect(
            verifyWebhookSignature(
                payload,
                webhookId,
                timestamp,
                `v2,${sig}`,
                secret
            )
        ).toBe(false)
    })
})