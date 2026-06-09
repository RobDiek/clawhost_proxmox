const getPolarConfig = () => {
    const url = process.env.CLIENT
    const http = url?.includes('localhost') ? 'http' : 'https'

    const successUrl = `${http}://${url}/?payment=success&checkout_id={CHECKOUT_ID}`
    const cancelUrl = `${http}://${url}/`

    return {
        organizationId: process.env.POLAR_ORGANIZATION_ID,
        successUrl,
        cancelUrl,
        webhookSecret: process.env.POLAR_WEBHOOK_SECRET
    }
}

export default getPolarConfig