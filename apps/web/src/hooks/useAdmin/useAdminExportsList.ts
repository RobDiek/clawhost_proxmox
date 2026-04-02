import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import ADMIN_EXPORTS_QUERY_KEY from '@/hooks/useAdmin/ADMIN_EXPORTS_QUERY_KEY'

const useAdminExportsList = (limit: number = 20, sort?: string) => {
    return useInfiniteQuery({
        queryKey: [...ADMIN_EXPORTS_QUERY_KEY, limit, sort],
        queryFn: ({ pageParam }) =>
            api.listAdminExports(pageParam, limit, sort),
        initialPageParam: 1,
        getNextPageParam: (lastPage) =>
            lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
        staleTime: 0
    })
}

export default useAdminExportsList