import type { Claw } from '@/ts/Interfaces'
import type { QueryClient } from '@tanstack/react-query'

import CLAWS_QUERY_KEY from '@/hooks/useClaws/CLAWS_QUERY_KEY'
import ADMIN_CLAWS_QUERY_KEY from '@/hooks/useClaws/ADMIN_CLAWS_QUERY_KEY'

const removeClawFromCaches = (queryClient: QueryClient, id: string) => {
    queryClient.setQueryData<Claw[]>(CLAWS_QUERY_KEY, (old) =>
        old?.filter((c) => c.id !== id)
    )
    queryClient.setQueryData<Claw[]>(ADMIN_CLAWS_QUERY_KEY, (old) =>
        old?.filter((c) => c.id !== id)
    )
}

export default removeClawFromCaches