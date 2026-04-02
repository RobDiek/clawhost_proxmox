import type { DashboardState } from '@/ts/Interfaces'

import { create } from 'zustand'

const useDashboardStore = create<DashboardState>((set) => ({
    selectedClawId: null,
    setSelectedClawId: (value) => set({ selectedClawId: value }),

    selectedAgentId: null,
    setSelectedAgentId: (value) => set({ selectedAgentId: value }),

    selectedAgentClawId: null,
    setSelectedAgentClawId: (value) => set({ selectedAgentClawId: value }),

    chatSelectedAgent: null,
    setChatSelectedAgent: (value) => set({ chatSelectedAgent: value }),

    chatSettingsClawId: null,
    setChatSettingsClawId: (value) => set({ chatSettingsClawId: value }),

    chatAgentTab: null,
    setChatAgentTab: (value) => set({ chatAgentTab: value }),

    playgroundAgentTab: null,
    setPlaygroundAgentTab: (value) => set({ playgroundAgentTab: value }),

    playgroundClawTab: null,
    setPlaygroundClawTab: (value) => set({ playgroundClawTab: value }),

    chatClawTab: null,
    setChatClawTab: (value) => set({ chatClawTab: value }),

    showCreate: false,
    setShowCreate: (value) => set({ showCreate: value }),

    preselectedPlanId: null,
    setPreselectedPlanId: (value) => set({ preselectedPlanId: value }),

    createAgentClawId: null,
    setCreateAgentClawId: (value) => set({ createAgentClawId: value }),

    createAgentClawName: '',
    setCreateAgentClawName: (value) => set({ createAgentClawName: value }),

    resetDashboardState: () =>
        set({
            selectedClawId: null,
            selectedAgentId: null,
            selectedAgentClawId: null,
            chatSelectedAgent: null,
            chatSettingsClawId: null,
            chatAgentTab: null,
            playgroundAgentTab: null,
            playgroundClawTab: null,
            chatClawTab: null,
            showCreate: false,
            preselectedPlanId: null,
            createAgentClawId: null,
            createAgentClawName: ''
        })
}))

export default useDashboardStore