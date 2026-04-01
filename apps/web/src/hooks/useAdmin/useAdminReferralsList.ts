import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '@/lib'

const useAdminReferralsList = (limit: number = 20, sort?: string) => {
    return useInfiniteQuery({
        queryKey: ['admin-referrals', limit, sort],
        queryFn: ({ pageParam }) =>
            api.listAdminReferrals(pageParam, limit, sort),
        initialPageParam: 1,
        getNextPageParam: (lastPage) =>
            lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
        staleTime: 5 * 60 * 1000
    })
}

export default useAdminReferralsList