import type { Claw } from '@/ts/Interfaces'
import type { QueryClient } from '@tanstack/react-query'

import CLAWS_QUERY_KEY from '@/hooks/useClaws/CLAWS_QUERY_KEY'
import ADMIN_CLAWS_QUERY_KEY from '@/hooks/useClaws/ADMIN_CLAWS_QUERY_KEY'

const updateClawInCaches = (
    queryClient: QueryClient,
    id: string,
    updates: Partial<Claw>
) => {
    queryClient.setQueryData<Claw[]>(CLAWS_QUERY_KEY, (old) =>
        old?.map((c) => (c.id === id ? { ...c, ...updates } : c))
    )
    queryClient.setQueryData<Claw[]>(ADMIN_CLAWS_QUERY_KEY, (old) =>
        old?.map((c) => (c.id === id ? { ...c, ...updates } : c))
    )
}

export default updateClawInCaches