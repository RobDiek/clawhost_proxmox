import {
    VIDEO_OFFSET_RATIO,
    REVEAL_SIZE
} from '@/hooks/useDitherHover/constants'

const applyDitherClip = (
    el: HTMLElement,
    clientX: number,
    clientY: number
): void => {
    const rect = el.getBoundingClientRect()
    const mx = clientX - rect.left
    const mySect = clientY - rect.top
    const myVid = mySect + rect.height * VIDEO_OFFSET_RATIO
    const half = REVEAL_SIZE / 2
    el.style.setProperty('--sq-clip-top', `${Math.max(0, myVid - half)}px`)
    el.style.setProperty(
        '--sq-clip-right',
        `${Math.max(0, rect.width - mx - half)}px`
    )
    el.style.setProperty(
        '--sq-clip-bottom',
        `${Math.max(0, rect.height - myVid - half)}px`
    )
    el.style.setProperty('--sq-clip-left', `${Math.max(0, mx - half)}px`)
    el.style.setProperty('--sq-x', `${mx - half}px`)
    el.style.setProperty('--sq-y', `${mySect - half}px`)
    el.style.setProperty('--sq-w', `${REVEAL_SIZE}px`)
    el.style.setProperty('--sq-h', `${REVEAL_SIZE}px`)
}

const clearDitherClip = (el: HTMLElement): void => {
    el.style.setProperty('--sq-clip-top', '100%')
    el.style.setProperty('--sq-clip-right', '100%')
    el.style.setProperty('--sq-clip-bottom', '100%')
    el.style.setProperty('--sq-clip-left', '100%')
    el.style.setProperty('--sq-x', '-999px')
    el.style.setProperty('--sq-y', '-999px')
    el.style.setProperty('--sq-w', '0px')
    el.style.setProperty('--sq-h', '0px')
}

export { applyDitherClip, clearDitherClip }