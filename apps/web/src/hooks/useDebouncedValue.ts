import { useState, useEffect, useRef } from 'react'

const useDebouncedValue = (value: string, delay: number): string => {
    const [debouncedValue, setDebouncedValue] = useState(value)
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => {
            setDebouncedValue(value)
        }, delay)
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
        }
    }, [value, delay])

    return debouncedValue
}

export default useDebouncedValue