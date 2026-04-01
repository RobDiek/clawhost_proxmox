import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '@/lib'

const useAdminVolumesList = (limit: number = 20, sort?: string) => {
    return useInfiniteQuery({
        queryKey: ['admin-volumes', limit, sort],
        queryFn: ({ pageParam }) =>
            api.listAdminVolumes(pageParam, limit, sort),
        initialPageParam: 1,
        getNextPageParam: (lastPage) =>
            lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
        staleTime: 5 * 60 * 1000
    })
}

export default useAdminVolumesList