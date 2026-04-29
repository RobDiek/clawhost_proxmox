import type { UIState } from '@/ts/Interfaces'

import { create } from 'zustand'
import { TOAST_TYPE } from '@/lib/constants'
import STORAGE_KEYS from '@/lib/storageKeys'

const REBRAND_BANNER_EXPIRY = new Date('2026-05-28T00:00:00Z')
const HERMES_BANNER_EXPIRY = new Date('2026-06-28T00:00:00Z')

const isRebrandBannerActive = (): boolean => {
    if (new Date() > REBRAND_BANNER_EXPIRY) return false
    return !localStorage.getItem(STORAGE_KEYS.REBRAND_BANNER_DISMISSED)
}

const isHermesBannerActive = (): boolean => {
    if (new Date() > HERMES_BANNER_EXPIRY) return false
    return !localStorage.getItem(STORAGE_KEYS.HERMES_BANNER_DISMISSED)
}

const useUIStore = create<UIState>((set) => ({
    toast: null,
    showToast: (message, type = TOAST_TYPE.INFO, duration = 5000) =>
        set({ toast: { message, type, duration } }),
    hideToast: () => set({ toast: null }),

    rebrandBannerVisible: isRebrandBannerActive(),
    dismissRebrandBanner: () => {
        localStorage.setItem(STORAGE_KEYS.REBRAND_BANNER_DISMISSED, '1')
        set({ rebrandBannerVisible: false })
    },

    hermesBannerVisible: isHermesBannerActive(),
    dismissHermesBanner: () => {
        localStorage.setItem(STORAGE_KEYS.HERMES_BANNER_DISMISSED, '1')
        set({ hermesBannerVisible: false })
    }
}))

export default useUIStore