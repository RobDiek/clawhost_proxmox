import { useCallback } from 'react'
import ROUTES from '@/lib/constants/routes'

const prefetchedRoutes = new Set<string>()

const routeImportMap: Record<string, () => Promise<unknown>> = {
    [ROUTES.LOGIN]: () => import('@/pages/Login'),
    [ROUTES.CLAWS]: () => import('@/pages/Dashboard'),
    [ROUTES.SSH_KEYS]: () => import('@/pages/SSHKeys'),
    [ROUTES.ACCOUNT]: () => import('@/pages/Account'),
    [ROUTES.BILLING]: () => import('@/pages/Billing'),
    [ROUTES.AFFILIATE]: () => import('@/pages/Affiliate'),
    [ROUTES.LICENSE]: () => import('@/pages/License'),
    [ROUTES.TERMS]: () => import('@/pages/Terms'),
    [ROUTES.PRIVACY]: () => import('@/pages/Privacy'),
    [ROUTES.CHANGELOG]: () => import('@/pages/Changelog'),
    [ROUTES.BLOG]: () => import('@/pages/Blog'),
    [ROUTES.COMPARE]: () => import('@/pages/Compare')
}

const useRoutePrefetch = (): { prefetchRoute: (path: string) => void } => {
    const prefetchRoute = useCallback((path: string) => {
        const basePath = path.split('?')[0]
        if (prefetchedRoutes.has(basePath)) return

        const importFn = routeImportMap[basePath]
        if (importFn) {
            prefetchedRoutes.add(basePath)
            importFn()
        }
    }, [])

    return { prefetchRoute }
}

export default useRoutePrefetch