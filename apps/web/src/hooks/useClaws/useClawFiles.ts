import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import CLAW_FILES_QUERY_KEY from '@/hooks/useClaws/CLAW_FILES_QUERY_KEY'

const useClawFiles = (clawId: string, enabled: boolean) => {
    return useQuery({
        queryKey: [...CLAW_FILES_QUERY_KEY, clawId],
        queryFn: () => api.listClawFiles(clawId),
        enabled,
        gcTime: 0
    })
}

export default useClawFiles