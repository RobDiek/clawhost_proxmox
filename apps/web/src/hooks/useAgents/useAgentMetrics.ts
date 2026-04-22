import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import usePageVisibility from '@/hooks/usePageVisibility'
import AGENT_METRICS_QUERY_KEY from '@/hooks/useAgents/AGENT_METRICS_QUERY_KEY'

const useAgentMetrics = (agentId: string, enabled: boolean) => {
    const isVisible = usePageVisibility()

    return useQuery({
        queryKey: [...AGENT_METRICS_QUERY_KEY, agentId],
        queryFn: () => api.getAgentMetrics(agentId),
        enabled,
        refetchInterval: isVisible ? 5_000 : false,
        gcTime: 10_000
    })
}

export default useAgentMetrics