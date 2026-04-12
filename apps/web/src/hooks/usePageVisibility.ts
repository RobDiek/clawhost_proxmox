import { useState, useEffect } from 'react'

const usePageVisibility = (): boolean => {
    const [isVisible, setIsVisible] = useState(!document.hidden)

    useEffect(() => {
        const handler = () => setIsVisible(!document.hidden)
        document.addEventListener('visibilitychange', handler)
        return () => document.removeEventListener('visibilitychange', handler)
    }, [])

    return isVisible
}

export default usePageVisibility