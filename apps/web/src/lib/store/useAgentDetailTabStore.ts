import type { AgentDetailTabState } from '@/ts/Interfaces'

import { create } from 'zustand'

const useAgentDetailTabStore = create<AgentDetailTabState>((set) => ({
    tabStateMap: {},
    setTab: (agentId, tab) =>
        set((state) => ({
            tabStateMap: { ...state.tabStateMap, [agentId]: tab }
        }))
}))

export default useAgentDetailTabStore