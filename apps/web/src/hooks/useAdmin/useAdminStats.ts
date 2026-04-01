import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'

const useAdminStats = () => {
    return useQuery({
        queryKey: ['admin-stats'],
        queryFn: api.getAdminStats,
        staleTime: 30 * 1000,
        refetchInterval: 30 * 1000
    })
}

export default useAdminStats