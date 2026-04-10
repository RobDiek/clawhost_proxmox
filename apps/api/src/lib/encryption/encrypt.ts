import crypto from 'crypto'
import config from '@/lib/encryption/encryptionConfig'

const encrypt = (plaintext: string): string => {
    const key = config.getKey()
    const iv = crypto.randomBytes(config.IV_LENGTH)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
    ])
    const tag = cipher.getAuthTag()
    return `${config.PREFIX}${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`
}

export default encrypt