import type { TerminalState } from '@/ts/Interfaces'

import { create } from 'zustand'
import { TERMINAL_STATUS } from '@/lib/constants'

const useTerminalStore = create<TerminalState>((set) => ({
    status: TERMINAL_STATUS.IDLE,
    setStatus: (value) =>
        set((state) => ({
            status: typeof value === 'function' ? value(state.status) : value
        })),

    showScrollButton: false,
    setShowScrollButton: (value) => set({ showScrollButton: value }),

    resetTerminalState: () =>
        set({
            status: TERMINAL_STATUS.IDLE,
            showScrollButton: false
        })
}))

export default useTerminalStore