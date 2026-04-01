import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'

const useClawLogs = (clawId: string, enabled: boolean) => {
    return useQuery({
        queryKey: ['claw-logs', clawId],
        queryFn: () => api.getClawLogs(clawId),
        enabled,
        refetchInterval: 10_000,
        gcTime: 30_000
    })
}

export default useClawLogs