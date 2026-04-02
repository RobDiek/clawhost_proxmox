import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import CLAWS_QUERY_KEY from '@/hooks/useClaws/CLAWS_QUERY_KEY'

const useClaws = () => {
    return useQuery({
        queryKey: CLAWS_QUERY_KEY,
        queryFn: () => api.getClaws(),
        placeholderData: (previousData) => previousData,
        refetchInterval: 30_000
    })
}

export default useClaws