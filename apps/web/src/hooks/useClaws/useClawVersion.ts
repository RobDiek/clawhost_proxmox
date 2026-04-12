import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import usePageVisibility from '@/hooks/usePageVisibility'
import CLAW_VERSION_QUERY_KEY from '@/hooks/useClaws/CLAW_VERSION_QUERY_KEY'

const useClawVersion = (clawId: string, enabled: boolean) => {
    const isVisible = usePageVisibility()

    return useQuery({
        queryKey: [...CLAW_VERSION_QUERY_KEY, clawId],
        queryFn: () => api.getClawVersion(clawId),
        enabled,
        staleTime: 1000 * 60 * 5,
        refetchInterval: isVisible ? 10_000 : false,
        retry: 1
    })
}

export default useClawVersion