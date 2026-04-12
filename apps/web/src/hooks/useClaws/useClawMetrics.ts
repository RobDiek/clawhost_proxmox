import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import CLAW_METRICS_QUERY_KEY from '@/hooks/useClaws/CLAW_METRICS_QUERY_KEY'

const useClawMetrics = (clawId: string, enabled: boolean) => {
    return useQuery({
        queryKey: [...CLAW_METRICS_QUERY_KEY, clawId],
        queryFn: () => api.getClawMetrics(clawId),
        enabled,
        refetchInterval: 5_000,
        gcTime: 10_000
    })
}

export default useClawMetrics