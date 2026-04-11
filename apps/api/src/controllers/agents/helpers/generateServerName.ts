import crypto from 'crypto'

const generateServerName = (name: string, id: string): string => {
    const suffix = Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) =>
        b.toString(36).padStart(2, '0').slice(-1)
    ).join('')
    return `${name}-${id.slice(0, 8)}-${suffix}`.replace(/[^a-zA-Z0-9-]/g, '-')
}

export default generateServerName