import type { ClawDetailTabState } from '@/ts/Interfaces'

import { create } from 'zustand'

const useClawDetailTabStore = create<ClawDetailTabState>((set) => ({
    tabStateMap: {},
    setTab: (clawId, tab) =>
        set((state) => ({
            tabStateMap: { ...state.tabStateMap, [clawId]: tab }
        }))
}))

export default useClawDetailTabStore