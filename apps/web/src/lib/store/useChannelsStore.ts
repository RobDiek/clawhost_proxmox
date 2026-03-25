import type { ChannelsState } from '@/ts/Interfaces'

import { create } from 'zustand'

const useChannelsStore = create<ChannelsState>((set) => ({
    isPairing: false,
    setIsPairing: (value) => set({ isPairing: value }),

    pollEnabled: false,
    setPollEnabled: (value) => set({ pollEnabled: value }),

    versionUnsupported: false,
    setVersionUnsupported: (value) => set({ versionUnsupported: value }),

    isWhatsAppPaired: false,
    setIsWhatsAppPaired: (value) => set({ isWhatsAppPaired: value }),

    isRepairing: false,
    setIsRepairing: (value) => set({ isRepairing: value }),

    initialCheckDone: false,
    setInitialCheckDone: (value) => set({ initialCheckDone: value }),

    visibleSecrets: {},
    toggleSecret: (fieldId) =>
        set((state) => ({
            visibleSecrets: {
                ...state.visibleSecrets,
                [fieldId]: !state.visibleSecrets[fieldId]
            }
        })),

    resetPairingState: () =>
        set({
            isPairing: false,
            pollEnabled: false,
            versionUnsupported: false,
            isRepairing: false
        })
}))

export default useChannelsStore