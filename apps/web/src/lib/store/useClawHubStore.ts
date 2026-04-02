import type { ClawHubState } from '@/ts/Interfaces'

import { create } from 'zustand'

const useClawHubStore = create<ClawHubState>((set) => ({
    pendingSlug: null,
    setPendingSlug: (value) => set({ pendingSlug: value }),

    page: 1,
    setPage: (value) =>
        set((state) => ({
            page: typeof value === 'function' ? value(state.page) : value
        })),

    resetClawHubState: () =>
        set({
            pendingSlug: null,
            page: 1
        })
}))

export default useClawHubStore