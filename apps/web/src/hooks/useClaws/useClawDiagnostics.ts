import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import CLAW_DIAGNOSTICS_QUERY_KEY from '@/hooks/useClaws/CLAW_DIAGNOSTICS_QUERY_KEY'

const useClawDiagnostics = (clawId: string, enabled: boolean) => {
    return useQuery({
        queryKey: [...CLAW_DIAGNOSTICS_QUERY_KEY, clawId],
        queryFn: () => api.getClawDiagnostics(clawId),
        enabled,
        refetchInterval: 10_000,
        gcTime: 30_000
    })
}

export default useClawDiagnostics