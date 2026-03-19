import type { TerminalState } from '@/ts/Interfaces'

import { create } from 'zustand'

const useTerminalStore = create<TerminalState>((set) => ({
    status: 'idle',
    setStatus: (value) =>
        set((state) => ({
            status: typeof value === 'function' ? value(state.status) : value
        })),

    showScrollButton: false,
    setShowScrollButton: (value) => set({ showScrollButton: value }),

    resetTerminalState: () =>
        set({
            status: 'idle',
            showScrollButton: false
        })
}))

export default useTerminalStore