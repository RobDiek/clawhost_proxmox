import type { GoPlatform, MacArch } from '@/ts/Types'

import fetchGoManifest from '@/lib/fetchGoManifest'
import GO_PLATFORM from '@/lib/constants/goPlatform'

const downloadGoBinary = async (
    platform: GoPlatform,
    macArch?: MacArch
): Promise<void> => {
    const manifest = await fetchGoManifest()
    let url: string | null
    if (platform === GO_PLATFORM.MAC) {
        if (!macArch) throw new Error('mac arch required')
        url = manifest.mac[macArch]
    } else {
        url = manifest.windows
    }
    if (!url) throw new Error(`${platform} url missing`)

    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to fetch binary: ${res.status}`)
    const blob = await res.blob()

    const filename = url.split('/').pop() || `clawhost-${platform}`
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = decodeURIComponent(filename)
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(objectUrl)
}

export default downloadGoBinary