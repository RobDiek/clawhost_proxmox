import { RequestClient, externalUrls } from '@openclaw/shared'

const getClient = () => {
    const token = process.env.HETZNER_API_TOKEN
    if (!token) throw new Error('HETZNER_API_TOKEN is not set')

    return new RequestClient({
        baseUrl: externalUrls.HETZNER.API,
        getHeaders: () => ({ Authorization: `Bearer ${token}` })
    })
}

export default getClient