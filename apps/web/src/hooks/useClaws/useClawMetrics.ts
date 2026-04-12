import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import usePageVisibility from '@/hooks/usePageVisibility'
import CLAW_METRICS_QUERY_KEY from '@/hooks/useClaws/CLAW_METRICS_QUERY_KEY'

const useClawMetrics = (clawId: string, enabled: boolean) => {
    const isVisible = usePageVisibility()

    return useQuery({
        queryKey: [...CLAW_METRICS_QUERY_KEY, clawId],
        queryFn: () => api.getClawMetrics(clawId),
        enabled,
        refetchInterval: isVisible ? 5_000 : false,
        gcTime: 10_000
    })
}

export default useClawMetrics