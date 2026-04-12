import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import usePageVisibility from '@/hooks/usePageVisibility'
import CLAW_DIAGNOSTICS_QUERY_KEY from '@/hooks/useClaws/CLAW_DIAGNOSTICS_QUERY_KEY'

const useClawDiagnostics = (clawId: string, enabled: boolean) => {
    const isVisible = usePageVisibility()

    return useQuery({
        queryKey: [...CLAW_DIAGNOSTICS_QUERY_KEY, clawId],
        queryFn: () => api.getClawDiagnostics(clawId),
        enabled,
        refetchInterval: isVisible ? 10_000 : false,
        gcTime: 30_000
    })
}

export default useClawDiagnostics