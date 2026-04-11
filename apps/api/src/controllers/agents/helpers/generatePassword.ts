import crypto from 'crypto'

const generatePassword = (length = 16): string => {
    const chars =
        'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
    const mask = 127
    const result: string[] = []

    while (result.length < length) {
        const bytes = crypto.randomBytes(length * 2)
        for (let i = 0; i < bytes.length && result.length < length; i++) {
            const idx = bytes[i] & mask
            if (idx < chars.length) {
                result.push(chars[idx])
            }
        }
    }

    return result.join('')
}

export default generatePassword