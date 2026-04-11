const IV_LENGTH = 12
const PREFIX = 'enc:'

const getKey = (): Buffer => {
    const key = process.env.ENCRYPTION_KEY
    if (!key) throw new Error('ENCRYPTION_KEY environment variable is required')
    if (key.length !== 64 || !/^[0-9a-f]+$/i.test(key))
        throw new Error(
            'ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)'
        )
    return Buffer.from(key, 'hex')
}

export default { IV_LENGTH, PREFIX, getKey }