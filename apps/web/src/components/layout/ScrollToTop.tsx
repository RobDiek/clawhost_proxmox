import type { FC, ReactNode } from 'react'

import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const ScrollToTop: FC = (): ReactNode => {
    const { pathname } = useLocation()

    useEffect(() => {
        window.history.scrollRestoration = 'manual'

        if (window.location.hash) {
            const el = document.querySelector(window.location.hash)
            if (el) el.scrollIntoView()
            return
        }

        window.scrollTo(0, 0)
    }, [pathname])

    return null
}

export default ScrollToTop