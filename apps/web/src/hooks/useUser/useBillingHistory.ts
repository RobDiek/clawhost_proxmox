import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import BILLING_HISTORY_QUERY_KEY from '@/hooks/useUser/BILLING_HISTORY_QUERY_KEY'

const useBillingHistory = (limit: number = 10) => {
    return useInfiniteQuery({
        queryKey: [...BILLING_HISTORY_QUERY_KEY, limit],
        queryFn: ({ pageParam }) => api.getBillingHistory(pageParam, limit),
        initialPageParam: 1,
        getNextPageParam: (lastPage) =>
            lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
        staleTime: 0,
        gcTime: 0,
        refetchOnMount: 'always'
    })
}

export default useBillingHistory