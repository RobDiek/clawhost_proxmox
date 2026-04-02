import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import CLAW_LOGS_QUERY_KEY from '@/hooks/useClaws/CLAW_LOGS_QUERY_KEY'

const useClawLogs = (clawId: string, enabled: boolean) => {
    return useQuery({
        queryKey: [...CLAW_LOGS_QUERY_KEY, clawId],
        queryFn: () => api.getClawLogs(clawId),
        enabled,
        refetchInterval: 10_000,
        gcTime: 30_000
    })
}

export default useClawLogs