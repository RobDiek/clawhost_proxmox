import type { DetectedOS } from '@/ts/Types'

import { useState } from 'react'
import { DETECTION_UNKNOWN, GO_PLATFORM } from '@/lib/constants'

const detectOS = (): DetectedOS => {
    if (typeof navigator === 'undefined') return DETECTION_UNKNOWN
    const ua = navigator.userAgent.toLowerCase()
    const platform = (navigator.platform || '').toLowerCase()
    if (platform.includes('mac') || /macintosh|mac os x/.test(ua))
        return GO_PLATFORM.MAC
    if (platform.includes('win') || /windows/.test(ua))
        return GO_PLATFORM.WINDOWS
    return DETECTION_UNKNOWN
}

const useDetectedOS = (): DetectedOS => {
    const [os] = useState<DetectedOS>(() => detectOS())
    return os
}

export default useDetectedOS