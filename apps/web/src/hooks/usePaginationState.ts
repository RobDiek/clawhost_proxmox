import type {
    UsePaginationStateParams,
    UsePaginationStateReturn
} from '@/ts/Interfaces'

import { useMemo } from 'react'

const usePaginationState = <T>({
    data,
    pageSize
}: UsePaginationStateParams<T>): UsePaginationStateReturn<T> => {
    return useMemo(() => {
        const allItems = data?.pages.flatMap((page) => page.items) ?? []
        const total = data?.pages[0]?.total ?? 0
        const remaining = Math.max(0, total - allItems.length)
        const skeletonCount = Math.min(pageSize, remaining)

        return { allItems, total, remaining, skeletonCount }
    }, [data, pageSize])
}

export default usePaginationState