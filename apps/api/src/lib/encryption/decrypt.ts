import crypto from 'crypto'
import config from '@/lib/encryption/encryptionConfig'

const decrypt = (ciphertext: string): string => {
    if (!ciphertext.startsWith(config.PREFIX)) return ciphertext

    const parts = ciphertext.slice(config.PREFIX.length).split(':')
    if (parts.length !== 3) return ciphertext

    const key = config.getKey()
    const iv = Buffer.from(parts[0], 'hex')
    const encrypted = Buffer.from(parts[1], 'hex')
    const tag = Buffer.from(parts[2], 'hex')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return decipher.update(encrypted) + decipher.final('utf8')
}

export default decrypt