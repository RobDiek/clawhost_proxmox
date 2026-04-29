import type { MouseEvent } from 'react'
import type { DitherHoverHandlers } from '@/ts/Interfaces'

import { useCallback, useRef } from 'react'
import { SOUND_URL, SOUND_VOLUME, FADE_DURATION, FADE_STEP_INTERVAL } from '@/hooks/useDitherHover/constants'
import { applyDitherClip, clearDitherClip } from '@/hooks/useDitherHover/helpers'

const useDitherHover = (): DitherHoverHandlers => {
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const preloadedRef = useRef(false)
    const fadeRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const ensureAudio = useCallback(() => {
        if (audioRef.current) return
        const audio = new Audio(SOUND_URL)
        audio.loop = true
        audio.volume = 0
        audio.preload = 'auto'
        audioRef.current = audio
    }, [])

    const fadeIn = useCallback(() => {
        if (fadeRef.current) clearInterval(fadeRef.current)
        const audio = audioRef.current
        if (!audio) return
        const step = SOUND_VOLUME / (FADE_DURATION / FADE_STEP_INTERVAL)
        fadeRef.current = setInterval(() => {
            if (audio.volume + step >= SOUND_VOLUME) {
                audio.volume = SOUND_VOLUME
                if (fadeRef.current) clearInterval(fadeRef.current)
                fadeRef.current = null
            } else {
                audio.volume += step
            }
        }, FADE_STEP_INTERVAL)
    }, [])

    const fadeOut = useCallback(() => {
        if (fadeRef.current) clearInterval(fadeRef.current)
        const audio = audioRef.current
        if (!audio) return
        const step = SOUND_VOLUME / (FADE_DURATION / FADE_STEP_INTERVAL)
        fadeRef.current = setInterval(() => {
            if (audio.volume - step <= 0) {
                audio.volume = 0
                audio.pause()
                audio.currentTime = 0
                if (fadeRef.current) clearInterval(fadeRef.current)
                fadeRef.current = null
            } else {
                audio.volume -= step
            }
        }, FADE_STEP_INTERVAL)
    }, [])

    const startSound = useCallback(() => {
        ensureAudio()
        const audio = audioRef.current
        if (!audio) return
        if (!preloadedRef.current) {
            audio.load()
            preloadedRef.current = true
        }
        audio.volume = 0
        audio.play().catch(() => {})
        fadeIn()
    }, [ensureAudio, fadeIn])

    const onMouseMove = useCallback((e: MouseEvent<HTMLElement>) => {
        applyDitherClip(e.currentTarget, e.clientX, e.clientY)
        if (audioRef.current?.paused !== false) startSound()
    }, [startSound])

    const onMouseLeave = useCallback((e: MouseEvent<HTMLElement>) => {
        clearDitherClip(e.currentTarget)
        fadeOut()
    }, [fadeOut])

    const resetDither = useCallback((el: HTMLElement | null) => {
        if (!el) return
        clearDitherClip(el)
        fadeOut()
    }, [fadeOut])

    return { onMouseMove, onMouseLeave, resetDither }
}

export default useDitherHover