import { useEffect, useState } from 'react'
import { STORAGE_KEYS } from '@/lib/constants'

const COOLDOWN_KEY = STORAGE_KEYS.OTP_SENT_AT
const COOLDOWN_DURATION = 60

const getRemainingCooldown = (): number => {
    const sentAt = localStorage.getItem(COOLDOWN_KEY)
    if (!sentAt) return 0
    const elapsed = Math.floor((Date.now() - Number(sentAt)) / 1000)
    return Math.max(0, COOLDOWN_DURATION - elapsed)
}

const useOtpCooldown = () => {
    const [cooldown, setCooldown] = useState(getRemainingCooldown)

    useEffect(() => {
        if (cooldown <= 0) return
        const interval = setInterval(() => {
            setCooldown(getRemainingCooldown())
        }, 1000)
        return () => clearInterval(interval)
    }, [cooldown])

    const startCooldown = () => {
        localStorage.setItem(COOLDOWN_KEY, String(Date.now()))
        setCooldown(COOLDOWN_DURATION)
    }

    return { cooldown, startCooldown }
}

export default useOtpCooldown