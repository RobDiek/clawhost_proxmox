import type { GoManifest } from '@/ts/Interfaces'

const GO_MANIFEST_URL = '/go.json'

const fetchGoManifest = async (): Promise<GoManifest> => {
    const res = await fetch(GO_MANIFEST_URL, { cache: 'no-cache' })
    if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`)
    const data = await res.json()
    return {
        version: data.version ?? null,
        mac: {
            arm64: data.mac?.arm64 ?? null,
            x64: data.mac?.x64 ?? null
        },
        windows: data.windows ?? null,
        loading: false
    }
}

export default fetchGoManifest