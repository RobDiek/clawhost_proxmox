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

    const filename = url.split('/').pop() || `clawnode-${platform}`
    const a = document.createElement('a')
    a.href = url
    a.download = decodeURIComponent(filename)
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
}

export default downloadGoBinary