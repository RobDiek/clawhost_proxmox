import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import usePageVisibility from '@/hooks/usePageVisibility'
import CLAW_LOGS_QUERY_KEY from '@/hooks/useClaws/CLAW_LOGS_QUERY_KEY'

const useClawLogs = (clawId: string, enabled: boolean) => {
    const isVisible = usePageVisibility()

    return useQuery({
        queryKey: [...CLAW_LOGS_QUERY_KEY, clawId],
        queryFn: () => api.getClawLogs(clawId),
        enabled,
        refetchInterval: isVisible ? 10_000 : false,
        gcTime: 30_000
    })
}

export default useClawLogs