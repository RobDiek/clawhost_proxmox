import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'

const useClawDiagnostics = (clawId: string, enabled: boolean) => {
    return useQuery({
        queryKey: ['claw-diagnostics', clawId],
        queryFn: () => api.getClawDiagnostics(clawId),
        enabled,
        refetchInterval: 10_000,
        gcTime: 30_000
    })
}

export default useClawDiagnostics