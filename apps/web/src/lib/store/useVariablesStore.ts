import type { VariablesState } from '@/ts/Interfaces'

import { create } from 'zustand'

const useVariablesStore = create<VariablesState>((set) => ({
    showValues: {},
    toggleValue: (key) =>
        set((state) => ({
            showValues: {
                ...state.showValues,
                [key]: !state.showValues[key]
            }
        })),

    copiedKey: null,
    setCopiedKey: (value) => set({ copiedKey: value }),

    showErrors: false,
    setShowErrors: (value) => set({ showErrors: value }),

    deleteIndex: null,
    setDeleteIndex: (value) => set({ deleteIndex: value }),

    dontAskAgain: false,
    setDontAskAgain: (value) => set({ dontAskAgain: value }),

    skipDeleteConfirmation: false,
    setSkipDeleteConfirmation: (value) =>
        set({ skipDeleteConfirmation: value }),

    resetVariablesState: () =>
        set({
            showValues: {},
            copiedKey: null,
            showErrors: false,
            deleteIndex: null,
            dontAskAgain: false,
            skipDeleteConfirmation: false
        })
}))

export default useVariablesStore