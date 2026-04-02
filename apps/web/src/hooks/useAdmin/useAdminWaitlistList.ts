import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import ADMIN_WAITLIST_QUERY_KEY from '@/hooks/useAdmin/ADMIN_WAITLIST_QUERY_KEY'

const useAdminWaitlistList = (
    limit: number = 20,
    search?: string,
    sort?: string
) => {
    return useInfiniteQuery({
        queryKey: [...ADMIN_WAITLIST_QUERY_KEY, limit, search, sort],
        queryFn: ({ pageParam }) =>
            api.listAdminWaitlist(pageParam, limit, search, sort),
        initialPageParam: 1,
        getNextPageParam: (lastPage) =>
            lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
        staleTime: 0
    })
}

export default useAdminWaitlistList