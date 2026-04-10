const IV_LENGTH = 12
const PREFIX = 'enc:'

const getKey = (): Buffer => {
    const key = process.env.ENCRYPTION_KEY
    if (!key) throw new Error('ENCRYPTION_KEY environment variable is required')
    return Buffer.from(key, 'hex')
}

export default { IV_LENGTH, PREFIX, getKey }