import type { DetectedOS } from '@/ts/Types'

import { useState } from 'react'
import GO_PLATFORM from '@/lib/constants/goPlatform'

const UNKNOWN_OS: DetectedOS = 'unknown'

const detectOS = (): DetectedOS => {
    if (typeof navigator === 'undefined') return UNKNOWN_OS
    const ua = navigator.userAgent.toLowerCase()
    const platform = (navigator.platform || '').toLowerCase()
    if (platform.includes('mac') || /macintosh|mac os x/.test(ua))
        return GO_PLATFORM.MAC
    if (platform.includes('win') || /windows/.test(ua))
        return GO_PLATFORM.WINDOWS
    return UNKNOWN_OS
}

const useDetectedOS = (): DetectedOS => {
    const [os] = useState<DetectedOS>(() => detectOS())
    return os
}

export default useDetectedOS