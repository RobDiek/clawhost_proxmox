import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import CLAW_FILE_QUERY_KEY from '@/hooks/useClaws/CLAW_FILE_QUERY_KEY'

const useClawFile = (clawId: string, path: string, enabled: boolean) => {
    return useQuery({
        queryKey: [...CLAW_FILE_QUERY_KEY, clawId, path],
        queryFn: () => api.readClawFile(clawId, path),
        enabled: enabled && path.length > 0,
        gcTime: 0
    })
}

export default useClawFile