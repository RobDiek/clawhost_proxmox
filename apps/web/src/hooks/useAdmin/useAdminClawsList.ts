import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import ADMIN_CLAWS_QUERY_KEY from '@/hooks/useClaws/ADMIN_CLAWS_QUERY_KEY'

const useAdminClawsList = (
    limit: number = 20,
    search?: string,
    sort?: string
) => {
    return useInfiniteQuery({
        queryKey: [...ADMIN_CLAWS_QUERY_KEY, limit, search, sort],
        queryFn: ({ pageParam }) =>
            api.listAdminClaws(pageParam, limit, search, sort),
        initialPageParam: 1,
        getNextPageParam: (lastPage) =>
            lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
        staleTime: 0
    })
}

export default useAdminClawsList