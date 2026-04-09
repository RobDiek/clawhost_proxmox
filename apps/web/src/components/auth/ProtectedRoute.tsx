import type { FC, ReactNode } from 'react'
import type { ProtectedRouteProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { AUTH_STORAGE_KEY } from '@/lib/firebase'
import { ROUTES } from '@/lib'

const ProtectedRoute: FC<ProtectedRouteProps> = ({ children }): ReactNode => {
    const { user, loading } = useAuth()
    const wasPreviouslyAuthed =
        localStorage.getItem(AUTH_STORAGE_KEY) === 'true'

    if (!wasPreviouslyAuthed && !user)
        return <Navigate to={ROUTES.LOGIN} replace />

    if (loading && wasPreviouslyAuthed) return null

    if (!loading && !user) return <Navigate to={ROUTES.LOGIN} replace />

    return <Fragment>{children}</Fragment>
}

export default ProtectedRoute