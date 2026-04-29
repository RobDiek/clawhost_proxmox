import type { MouseEvent } from 'react'
import type { DitherHoverHandlers } from '@/ts/Interfaces'

import { useCallback, useRef } from 'react'

const VIDEO_OFFSET_RATIO = 0.2
const REVEAL_SIZE = 200
const SOUND_URL = '/sounds/static-noise.mp3'
const SOUND_VOLUME = 0.05

const useDitherHover = (): DitherHoverHandlers => {
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const preloadedRef = useRef(false)

    const ensureAudio = useCallback(() => {
        if (audioRef.current) return
        const audio = new Audio(SOUND_URL)
        audio.loop = true
        audio.volume = SOUND_VOLUME
        audio.preload = 'auto'
        audioRef.current = audio
    }, [])

    const startSound = useCallback(() => {
        ensureAudio()
        const audio = audioRef.current
        if (!audio) return
        if (!preloadedRef.current) {
            audio.load()
            preloadedRef.current = true
        }
        audio.play().catch(() => {})
    }, [ensureAudio])

    const stopSound = useCallback(() => {
        if (!audioRef.current) return
        audioRef.current.pause()
        audioRef.current.currentTime = 0
    }, [])

    const onMouseMove = useCallback((e: MouseEvent<HTMLElement>) => {
        const el = e.currentTarget
        const rect = el.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const mySect = e.clientY - rect.top
        const myVid = mySect + rect.height * VIDEO_OFFSET_RATIO
        const half = REVEAL_SIZE / 2
        el.style.setProperty('--sq-clip-top', `${Math.max(0, myVid - half)}px`)
        el.style.setProperty('--sq-clip-right', `${Math.max(0, rect.width - mx - half)}px`)
        el.style.setProperty('--sq-clip-bottom', `${Math.max(0, rect.height - myVid - half)}px`)
        el.style.setProperty('--sq-clip-left', `${Math.max(0, mx - half)}px`)
        el.style.setProperty('--sq-x', `${mx - half}px`)
        el.style.setProperty('--sq-y', `${mySect - half}px`)
        el.style.setProperty('--sq-w', `${REVEAL_SIZE}px`)
        el.style.setProperty('--sq-h', `${REVEAL_SIZE}px`)
        if (audioRef.current?.paused !== false) startSound()
    }, [startSound])

    const onMouseLeave = useCallback((e: MouseEvent<HTMLElement>) => {
        const el = e.currentTarget
        el.style.setProperty('--sq-clip-top', '100%')
        el.style.setProperty('--sq-clip-right', '100%')
        el.style.setProperty('--sq-clip-bottom', '100%')
        el.style.setProperty('--sq-clip-left', '100%')
        el.style.setProperty('--sq-x', '-999px')
        el.style.setProperty('--sq-y', '-999px')
        el.style.setProperty('--sq-w', '0px')
        el.style.setProperty('--sq-h', '0px')
        stopSound()
    }, [stopSound])

    return { onMouseMove, onMouseLeave }
}

export default useDitherHover