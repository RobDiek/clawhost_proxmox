import type { FC, ReactNode } from 'react'

import { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import { t } from '@openclaw/i18n'
import { AuthProvider } from '@/lib/auth'
import { TooltipProvider } from '@/components/ui'
import { useThemeEffect, useLanguageEffect } from '@/hooks'
import { ROUTES } from '@/lib'
import { ProtectedRoute, Toast } from '@/components'
import { LicenseGate, UpdateBanner } from '@electron/components'

const Login = lazy(() => import('@/pages/Login'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Account = lazy(() => import('@/pages/Account'))
const SSHKeys = lazy(() => import('@/pages/SSHKeys'))
const Billing = lazy(() => import('@/pages/Billing'))

const App: FC = (): ReactNode => {
    useThemeEffect()
    const language = useLanguageEffect()

    return (
        <TooltipProvider delayDuration={300}>
            <AuthProvider>
                <div id='electron-drag-bar' className='bg-background'>
                    <span>{t('common.brandNameGo')}</span>
                </div>
                <UpdateBanner />
                <Toast />
                <Suspense key={language}>
                    <Routes>
                        <Route path={ROUTES.LOGIN} element={<Login />} />
                        <Route
                            path={ROUTES.ACCOUNT}
                            element={
                                <ProtectedRoute>
                                    <Account />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path={ROUTES.SSH_KEYS}
                            element={
                                <ProtectedRoute>
                                    <LicenseGate>
                                        <SSHKeys />
                                    </LicenseGate>
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path={ROUTES.BILLING}
                            element={
                                <ProtectedRoute>
                                    <LicenseGate>
                                        <Billing />
                                    </LicenseGate>
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path='*'
                            element={
                                <ProtectedRoute>
                                    <LicenseGate>
                                        <Dashboard />
                                    </LicenseGate>
                                </ProtectedRoute>
                            }
                        />
                    </Routes>
                </Suspense>
            </AuthProvider>
        </TooltipProvider>
    )
}

export default App