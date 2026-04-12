import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import usePageVisibility from '@/hooks/usePageVisibility'
import CLAW_OVERVIEW_QUERY_KEY from '@/hooks/useClaws/CLAW_OVERVIEW_QUERY_KEY'

const useClawOverview = (clawId: string, enabled: boolean) => {
    const isVisible = usePageVisibility()

    return useQuery({
        queryKey: [...CLAW_OVERVIEW_QUERY_KEY, clawId],
        queryFn: () => api.getClawOverview(clawId),
        enabled,
        refetchInterval: isVisible ? 30_000 : false,
        gcTime: 60_000
    })
}

export default useClawOverview