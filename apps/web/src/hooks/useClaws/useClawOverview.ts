import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import CLAW_OVERVIEW_QUERY_KEY from '@/hooks/useClaws/CLAW_OVERVIEW_QUERY_KEY'

const useClawOverview = (clawId: string, enabled: boolean) => {
    return useQuery({
        queryKey: [...CLAW_OVERVIEW_QUERY_KEY, clawId],
        queryFn: () => api.getClawOverview(clawId),
        enabled,
        refetchInterval: 30_000,
        gcTime: 60_000
    })
}

export default useClawOverview