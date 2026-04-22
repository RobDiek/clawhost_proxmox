import type { Agent } from '@/ts/Interfaces'
import type { QueryClient } from '@tanstack/react-query'

import AGENTS_QUERY_KEY from '@/hooks/useAgents/AGENTS_QUERY_KEY'
import ADMIN_AGENTS_QUERY_KEY from '@/hooks/useAgents/ADMIN_AGENTS_QUERY_KEY'

const updateAgentInCaches = (
    queryClient: QueryClient,
    id: string,
    updates: Partial<Agent>
) => {
    queryClient.setQueryData<Agent[]>(AGENTS_QUERY_KEY, (old) =>
        old?.map((c) => (c.id === id ? { ...c, ...updates } : c))
    )
    queryClient.setQueryData<Agent[]>(ADMIN_AGENTS_QUERY_KEY, (old) =>
        old?.map((c) => (c.id === id ? { ...c, ...updates } : c))
    )
}

export default updateAgentInCaches