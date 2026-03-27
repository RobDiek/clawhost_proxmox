import type { UIState } from '@/ts/Interfaces'

import { create } from 'zustand'
import { STORAGE_KEYS } from '@/lib/storageKeys'

const useUIStore = create<UIState>((set) => ({
    isCreateModalOpen: false,
    setCreateModalOpen: (open) => set({ isCreateModalOpen: open }),

    toast: null,
    showToast: (message, type = 'info', duration = 5000) =>
        set({ toast: { message, type, duration } }),
    hideToast: () => set({ toast: null }),

    phBannerVisible: false,
    dismissPhBanner: () => {
        localStorage.setItem(STORAGE_KEYS.PH_BANNER_DISMISSED, '1')
        set({ phBannerVisible: false })
    }
}))

export default useUIStore