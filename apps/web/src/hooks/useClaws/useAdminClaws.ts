import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import ADMIN_CLAWS_QUERY_KEY from '@/hooks/useClaws/ADMIN_CLAWS_QUERY_KEY'

const useAdminClaws = (enabled = true) => {
    return useQuery({
        queryKey: ADMIN_CLAWS_QUERY_KEY,
        queryFn: () => api.getAdminClaws(),
        placeholderData: (previousData) => previousData,
        refetchInterval: 30_000,
        enabled
    })
}

export default useAdminClaws