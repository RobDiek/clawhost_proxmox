import type { SkillsState } from '@/ts/Interfaces'

import { create } from 'zustand'

const useSkillsStore = create<SkillsState>((set) => ({
    pendingSkill: null,
    setPendingSkill: (value) => set({ pendingSkill: value }),

    pendingSlug: null,
    setPendingSlug: (value) => set({ pendingSlug: value }),

    resetSkillsState: () =>
        set({
            pendingSkill: null,
            pendingSlug: null
        })
}))

export default useSkillsStore