import { useCallback, useEffect, useRef } from 'react'

const useAbortController = () => {
    const ref = useRef<AbortController | null>(null)

    useEffect(() => {
        return () => {
            ref.current?.abort()
        }
    }, [])

    return useCallback(() => {
        ref.current?.abort()
        ref.current = new AbortController()
        return ref.current.signal
    }, [])
}

export default useAbortController