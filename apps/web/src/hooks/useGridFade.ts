import { useEffect } from 'react'

const FADE_DISTANCE = 800

const useGridFade = (): void => {
    useEffect(() => {
        const grid = document.querySelector('.v2-grid') as HTMLElement | null
        const gradient = document.querySelector('.v2-gradient') as HTMLElement | null

        const handleScroll = () => {
            const opacity = Math.max(0, 1 - window.scrollY / FADE_DISTANCE)
            if (grid) grid.style.opacity = String(opacity)
            if (gradient) gradient.style.opacity = String(opacity)
        }

        handleScroll()
        window.addEventListener('scroll', handleScroll, { passive: true })
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])
}

export default useGridFade