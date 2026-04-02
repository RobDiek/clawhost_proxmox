import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import CLAW_VERSION_QUERY_KEY from '@/hooks/useClaws/CLAW_VERSION_QUERY_KEY'

const useClawVersion = (clawId: string, enabled: boolean) => {
    return useQuery({
        queryKey: [...CLAW_VERSION_QUERY_KEY, clawId],
        queryFn: () => api.getClawVersion(clawId),
        enabled,
        staleTime: 1000 * 60 * 5,
        refetchInterval: 10_000,
        retry: 1
    })
}

export default useClawVersion