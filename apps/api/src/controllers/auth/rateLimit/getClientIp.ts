import type { Context } from 'hono'

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+$/

const getClientIp = (c: Context): string | null => {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    if (forwarded && IP_REGEX.test(forwarded)) return forwarded

    const realIp = c.req.header('x-real-ip')
    if (realIp && IP_REGEX.test(realIp)) return realIp

    return null
}

export default getClientIp