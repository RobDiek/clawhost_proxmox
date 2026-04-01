import { useCallback } from 'react'

const prefetchedRoutes = new Set<string>()

const routeImportMap: Record<string, () => Promise<unknown>> = {
    '/login': () => import('@/pages/Login'),
    '/claws': () => import('@/pages/Dashboard'),
    '/ssh-keys': () => import('@/pages/SSHKeys'),
    '/account': () => import('@/pages/Account'),
    '/billing': () => import('@/pages/Billing'),
    '/affiliate': () => import('@/pages/Affiliate'),
    '/license': () => import('@/pages/License'),
    '/terms': () => import('@/pages/Terms'),
    '/privacy': () => import('@/pages/Privacy'),
    '/changelog': () => import('@/pages/Changelog'),
    '/blog': () => import('@/pages/Blog'),
    '/compare': () => import('@/pages/Compare')
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