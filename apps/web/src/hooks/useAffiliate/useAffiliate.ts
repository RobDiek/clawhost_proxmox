import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import AFFILIATE_QUERY_KEY from '@/hooks/useAffiliate/AFFILIATE_QUERY_KEY'

const useAffiliate = () => {
    return useQuery({
        queryKey: AFFILIATE_QUERY_KEY,
        queryFn: api.getAffiliate,
        placeholderData: (previousData) => previousData
    })
}

export default useAffiliate