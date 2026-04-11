import type { DashboardState } from '@/ts/Interfaces'

import { create } from 'zustand'

const useDashboardStore = create<DashboardState>((set) => ({
    chatSettingsClawId: null,
    setChatSettingsClawId: (value) => set({ chatSettingsClawId: value }),

    chatClawTab: null,
    setChatClawTab: (value) => set({ chatClawTab: value }),

    showCreate: false,
    setShowCreate: (value) => set({ showCreate: value }),

    preselectedPlanId: null,
    setPreselectedPlanId: (value) => set({ preselectedPlanId: value }),

    resetDashboardState: () =>
        set({
            chatSettingsClawId: null,
            chatClawTab: null,
            showCreate: false,
            preselectedPlanId: null
        })
}))

export default useDashboardStore