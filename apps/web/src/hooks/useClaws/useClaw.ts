import type { UseClawOptions } from '@/ts/Interfaces'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib'
import CLAW_QUERY_KEY from '@/hooks/useClaws/CLAW_QUERY_KEY'

const useClaw = (id: string, options?: UseClawOptions) => {
    return useQuery({
        queryKey: [...CLAW_QUERY_KEY, id],
        queryFn: () => api.getClaw(id, options?.sync),
        enabled: !!id
    })
}

export default useClaw