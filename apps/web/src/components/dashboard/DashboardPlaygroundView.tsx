import type { FC, ReactNode } from 'react'
import type { DashboardPlaygroundViewProps } from '@/ts/Interfaces'

import { Suspense, lazy } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { EmptyState, ClawMascot } from '@/components'
import { PlaygroundLoadingState } from '@/components/playground'

const PlaygroundCanvas = lazy(
    () => import('@/components/playground/PlaygroundCanvas')
)
const PlaygroundDetailPanel = lazy(
    () => import('@/components/playground/PlaygroundDetailPanel')
)

const DashboardPlaygroundView: FC<DashboardPlaygroundViewProps> = ({
    displayedClaws,
    adminMode,
    nodes,
    edges,
    plans,
    sshKeys,
    selectedClawId,
    playgroundClawTab,
    isLoading,
    activeIsError,
    onClawSelect,
    onPlaygroundClawTabChange,
    onCreateClick
}): ReactNode => {
    const activeClaws = displayedClaws

    const selectedClaw = selectedClawId
        ? activeClaws?.find((c) => c.id === selectedClawId) || null
        : null

    return (
        <Suspense
            fallback={
                <div className='flex h-full min-w-0 flex-1 items-center justify-center'>
                    <PlaygroundLoadingState />
                </div>
            }
        >
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className='flex h-full min-w-0 flex-1'
            >
                <div className='relative h-full min-w-0 flex-1'>
                    <PlaygroundCanvas
                        key={adminMode ? 'admin' : 'user'}
                        initialNodes={nodes}
                        initialEdges={edges}
                        onNodeClick={(clawId) => {
                            onClawSelect(clawId)
                        }}
                        onPaneClick={() => {
                            onClawSelect(null)
                        }}
                        panelOpen={!!selectedClaw}
                        selectedClawId={selectedClawId}
                    />

                    {!isLoading &&
                        !activeIsError &&
                        (!displayedClaws || displayedClaws.length === 0) && (
                            <div className='pointer-events-none absolute inset-0 z-10 flex items-center justify-center'>
                                <div className='pointer-events-auto -mt-20'>
                                    <EmptyState
                                        icon={
                                            <ClawMascot className='h-10 w-10' />
                                        }
                                        title={
                                            adminMode
                                                ? t('dashboard.adminNoClaws')
                                                : t('playground.noClawsYet')
                                        }
                                        description={
                                            adminMode
                                                ? t(
                                                      'dashboard.adminDescription'
                                                  )
                                                : t(
                                                      'playground.noClawsDescription'
                                                  )
                                        }
                                        actionLabel={t('nav.deployOpenClaw')}
                                        onAction={onCreateClick}
                                    />
                                </div>
                            </div>
                        )}
                </div>

                <AnimatePresence mode='wait'>
                    {selectedClaw && (
                        <PlaygroundDetailPanel
                            key='detail-panel'
                            claw={selectedClaw}
                            plans={plans}
                            sshKeys={sshKeys}
                            onClose={() => onClawSelect(null)}
                            initialTab={playgroundClawTab || undefined}
                            onTabChange={onPlaygroundClawTabChange}
                        />
                    )}
                </AnimatePresence>
            </motion.div>
        </Suspense>
    )
}

export default DashboardPlaygroundView