import { Polar } from '@polar-sh/sdk'

let polarClient: Polar | null = null

const getPolarClient = (): Polar => {
    if (polarClient) return polarClient

    const accessToken = process.env.POLAR_ACCESS_TOKEN
    if (!accessToken) throw new Error('POLAR_ACCESS_TOKEN is not set')

    polarClient = new Polar({
        accessToken
    })

    return polarClient
}

export default getPolarClient