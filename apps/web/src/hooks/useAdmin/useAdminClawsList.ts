import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '@/lib'

const useAdminClawsList = (
    limit: number = 20,
    search?: string,
    sort?: string
) => {
    return useInfiniteQuery({
        queryKey: ['admin-claws', limit, search, sort],
        queryFn: ({ pageParam }) =>
            api.listAdminClaws(pageParam, limit, search, sort),
        initialPageParam: 1,
        getNextPageParam: (lastPage) =>
            lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
        staleTime: 5 * 60 * 1000
    })
}

export default useAdminClawsList