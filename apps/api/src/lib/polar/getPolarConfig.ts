import { apiPaths } from '@openclaw/shared'

const getPolarConfig = () => {
    const url = process.env.CLIENT
    const http = 'https'

    const successUrl = `${http}://${url}${apiPaths.CLAWS.BASE}?payment=success&checkout_id={CHECKOUT_ID}`
    const cancelUrl = `${http}://${url}${apiPaths.CLAWS.BASE}`

    return {
        organizationId: process.env.POLAR_ORGANIZATION_ID,
        successUrl,
        cancelUrl,
        webhookSecret: process.env.POLAR_WEBHOOK_SECRET
    }
}

export default getPolarConfig