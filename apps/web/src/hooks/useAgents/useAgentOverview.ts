import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import usePageVisibility from '@/hooks/usePageVisibility'
import AGENT_OVERVIEW_QUERY_KEY from '@/hooks/useAgents/AGENT_OVERVIEW_QUERY_KEY'

const useAgentOverview = (agentId: string, enabled: boolean) => {
    const isVisible = usePageVisibility()

    return useQuery({
        queryKey: [...AGENT_OVERVIEW_QUERY_KEY, agentId],
        queryFn: () => api.getAgentOverview(agentId),
        enabled,
        refetchInterval: isVisible ? 30_000 : false,
        gcTime: 60_000
    })
}

export default useAgentOverview