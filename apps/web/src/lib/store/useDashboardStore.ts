import type { DashboardState } from '@/ts/Interfaces'

import { create } from 'zustand'

const useDashboardStore = create<DashboardState>((set) => ({
    selectedClawId: null,
    setSelectedClawId: (value) => set({ selectedClawId: value }),

    chatSettingsClawId: null,
    setChatSettingsClawId: (value) => set({ chatSettingsClawId: value }),

    chatClawTab: null,
    setChatClawTab: (value) => set({ chatClawTab: value }),

    playgroundClawTab: null,
    setPlaygroundClawTab: (value) => set({ playgroundClawTab: value }),

    showCreate: false,
    setShowCreate: (value) => set({ showCreate: value }),

    preselectedPlanId: null,
    setPreselectedPlanId: (value) => set({ preselectedPlanId: value }),

    resetDashboardState: () =>
        set({
            selectedClawId: null,
            chatSettingsClawId: null,
            chatClawTab: null,
            playgroundClawTab: null,
            showCreate: false,
            preselectedPlanId: null
        })
}))

export default useDashboardStore