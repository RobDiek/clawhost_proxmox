import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import ADMIN_USERS_QUERY_KEY from '@/hooks/useAdmin/ADMIN_USERS_QUERY_KEY'

const useAdminUsers = (
    limit: number = 20,
    search?: string,
    hasClaws?: string,
    sort?: string
) => {
    return useInfiniteQuery({
        queryKey: [...ADMIN_USERS_QUERY_KEY, limit, search, hasClaws, sort],
        queryFn: ({ pageParam }) =>
            api.getAdminUsers(pageParam, limit, search, hasClaws, sort),
        initialPageParam: 1,
        getNextPageParam: (lastPage) =>
            lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
        staleTime: 0
    })
}

export default useAdminUsers