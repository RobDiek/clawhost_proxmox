import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import usePageVisibility from '@/hooks/usePageVisibility'
import AGENT_DIAGNOSTICS_QUERY_KEY from '@/hooks/useAgents/AGENT_DIAGNOSTICS_QUERY_KEY'

const useAgentDiagnostics = (agentId: string, enabled: boolean) => {
    const isVisible = usePageVisibility()

    return useQuery({
        queryKey: [...AGENT_DIAGNOSTICS_QUERY_KEY, agentId],
        queryFn: () => api.getAgentDiagnostics(agentId),
        enabled,
        refetchInterval: isVisible ? 10_000 : false,
        gcTime: 30_000
    })
}

export default useAgentDiagnostics