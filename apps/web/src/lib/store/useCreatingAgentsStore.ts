import type { Agent } from '@/ts/Interfaces'
import type { CreatingAgentsState } from '@/ts/Interfaces'

import { create } from 'zustand'

const useCreatingAgentsStore = create<CreatingAgentsState>((set) => ({
    creatingAgents: [],
    addCreatingAgent: (agent: Agent) =>
        set((state) => ({
            creatingAgents: [...state.creatingAgents, agent]
        })),
    removeCreatingAgent: (id: string) =>
        set((state) => ({
            creatingAgents: state.creatingAgents.filter((a) => a.id !== id)
        }))
}))

export default useCreatingAgentsStore