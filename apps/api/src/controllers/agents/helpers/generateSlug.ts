import crypto from 'crypto'

const generateSlug = (id: string): string => {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
    const hash = crypto.createHash('sha256').update(id).digest()
    let slug = ''

    for (let i = 0; i < 8; i++) {
        slug += chars[hash[i] % chars.length]
    }

    return slug
}

export default generateSlug