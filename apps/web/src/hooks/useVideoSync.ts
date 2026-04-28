import type { RefObject } from 'react'

import { useEffect } from 'react'

const useVideoSync = (
    baseRef: RefObject<HTMLVideoElement | null>,
    ditherRef: RefObject<HTMLVideoElement | null>
): void => {
    useEffect(() => {
        const base = baseRef.current
        const dither = ditherRef.current
        if (!base || !dither) return

        const sync = () => {
            if (Math.abs(base.currentTime - dither.currentTime) > 0.1) {
                dither.currentTime = base.currentTime
            }
        }

        base.addEventListener('play', sync)
        base.addEventListener('seeked', sync)
        const interval = setInterval(sync, 1000)

        return () => {
            base.removeEventListener('play', sync)
            base.removeEventListener('seeked', sync)
            clearInterval(interval)
        }
    }, [baseRef, ditherRef])
}

export default useVideoSync