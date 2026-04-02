import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import PLAYGROUND_AGENTS_QUERY_KEY from '@/hooks/usePlayground/PLAYGROUND_AGENTS_QUERY_KEY'

const useClawAgents = (clawId: string, enabled: boolean) => {
    return useQuery({
        queryKey: [PLAYGROUND_AGENTS_QUERY_KEY, clawId],
        queryFn: () => api.getClawAgents(clawId),
        enabled,
        staleTime: 15_000,
        gcTime: 30_000,
        refetchInterval: 15_000,
        retry: 0
    })
}

export default useClawAgents