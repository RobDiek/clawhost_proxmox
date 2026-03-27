import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import PLANS_QUERY_KEY from '@/hooks/usePlans/PLANS_QUERY_KEY'

const usePlans = () => {
    const query = useQuery({
        queryKey: PLANS_QUERY_KEY,
        queryFn: api.getPlans,
        placeholderData: (previousData) => previousData,
        staleTime: 60_000,
        refetchInterval: 60_000,
        retry: false
    })

    return {
        ...query,
        plans: query.data?.plans,
        atCapacity: query.data?.atCapacity ?? false
    }
}

export default usePlans