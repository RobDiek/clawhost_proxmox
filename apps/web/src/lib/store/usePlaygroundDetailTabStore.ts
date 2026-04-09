import type { PlaygroundDetailTabState } from '@/ts/Interfaces'

import { create } from 'zustand'

const usePlaygroundDetailTabStore = create<PlaygroundDetailTabState>((set) => ({
    tabStateMap: {},
    setTab: (clawId, tab) =>
        set((state) => ({
            tabStateMap: { ...state.tabStateMap, [clawId]: tab }
        }))
}))

export default usePlaygroundDetailTabStore