import type { UseInfiniteScrollObserverParams } from '@/ts/Interfaces'

import { useRef, useCallback } from 'react'

const useInfiniteScrollObserver = ({
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage
}: UseInfiniteScrollObserverParams) => {
    const observerRef = useRef<IntersectionObserver | null>(null)

    const loadMoreRef = useCallback(
        (node: HTMLDivElement | null) => {
            if (isFetchingNextPage) return
            if (observerRef.current) observerRef.current.disconnect()
            observerRef.current = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting && hasNextPage) {
                    fetchNextPage()
                }
            })
            if (node) observerRef.current.observe(node)
        },
        [isFetchingNextPage, hasNextPage, fetchNextPage]
    )

    return loadMoreRef
}

export default useInfiniteScrollObserver