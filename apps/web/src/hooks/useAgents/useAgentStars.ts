import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import { AGENT_STARS_QUERY_KEY } from '@/hooks/useAgents'

const ONE_HOUR_MS = 60 * 60 * 1000

const useAgentStars = () => {
    return useQuery({
        queryKey: AGENT_STARS_QUERY_KEY,
        queryFn: () => api.getAgentStars(),
        staleTime: ONE_HOUR_MS,
        retry: false
    })
}

export default useAgentStars