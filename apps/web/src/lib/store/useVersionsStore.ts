import type { VersionsState } from '@/ts/Interfaces'

import { create } from 'zustand'

const useVersionsStore = create<VersionsState>((set) => ({
    installingVersion: null,
    setInstallingVersion: (value) => set({ installingVersion: value }),

    confirmVersion: null,
    setConfirmVersion: (value) => set({ confirmVersion: value })
}))

export default useVersionsStore