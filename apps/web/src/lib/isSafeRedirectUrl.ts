const ALLOWED_DOMAINS = ['polar.sh', 'checkout.polar.sh']

const isSafeRedirectUrl = (url: string): boolean => {
    try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'https:') return false
        return ALLOWED_DOMAINS.some(
            (domain) =>
                parsed.hostname === domain ||
                parsed.hostname.endsWith(`.${domain}`)
        )
    } catch {
        return false
    }
}

export default isSafeRedirectUrl