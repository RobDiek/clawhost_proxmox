import crypto from 'crypto'

const generateToken = (): string => {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join(
        ''
    )
}

export default generateToken