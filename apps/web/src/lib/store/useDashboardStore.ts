import type { DashboardState } from '@/ts/Interfaces'

import { create } from 'zustand'

const useDashboardStore = create<DashboardState>((set) => ({
    chatSettingsAgentId: null,
    setChatSettingsAgentId: (value) => set({ chatSettingsAgentId: value }),

    chatAgentTab: null,
    setChatAgentTab: (value) => set({ chatAgentTab: value }),

    showCreate: false,
    setShowCreate: (value) => set({ showCreate: value }),

    preselectedPlanId: null,
    setPreselectedPlanId: (value) => set({ preselectedPlanId: value })
}))

export default useDashboardStore