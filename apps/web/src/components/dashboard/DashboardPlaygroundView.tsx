import type { FC, ReactNode } from 'react'
import type { DashboardPlaygroundViewProps } from '@/ts/Interfaces'

import { Suspense, lazy, useMemo } from 'react'
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
const PlaygroundAgentDetailPanel = lazy(
    () => import('@/components/playground/PlaygroundAgentDetailPanel')
)

const DashboardPlaygroundView: FC<DashboardPlaygroundViewProps> = ({
    displayedClaws,
    agentQueries,
    adminMode,
    nodes,
    edges,
    plans,
    sshKeys,
    selectedClawId,
    selectedAgentId,
    selectedAgentClawId,
    playgroundClawTab,
    playgroundAgentTab,
    isLoading,
    activeIsError,
    onClawSelect,
    onAgentSelect,
    onPlaygroundClawTabChange,
    onPlaygroundAgentTabChange,
    onCreateClick
}): ReactNode => {
    const activeClaws = displayedClaws

    const selectedClaw =
        selectedClawId && !selectedAgentId
            ? activeClaws?.find((c) => c.id === selectedClawId) || null
            : null

    const selectedAgentClaw = selectedAgentClawId
        ? activeClaws?.find((c) => c.id === selectedAgentClawId) || null
        : null

    const selectedAgentResult = useMemo(() => {
        if (!selectedAgentId || !selectedAgentClaw) return null
        const clawIndex = displayedClaws.findIndex(
            (c) => c.id === selectedAgentClawId
        )
        const query = clawIndex >= 0 ? agentQueries[clawIndex] : null
        const agents = query?.data?.agents || []
        const agent = agents.find((a) => a.id === selectedAgentId) || null
        return {
            agent,
            isOnly: agents.length <= 1
        }
    }, [
        selectedAgentId,
        selectedAgentClaw,
        displayedClaws,
        selectedAgentClawId,
        agentQueries
    ])

    const selectedAgent = selectedAgentResult?.agent || null
    const isSelectedAgentOnly = selectedAgentResult?.isOnly || false

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
                            onAgentSelect(null, null)
                        }}
                        onAgentClick={(agentId, clawId) => {
                            onAgentSelect(agentId, clawId)
                            onClawSelect(null)
                        }}
                        onPaneClick={() => {
                            onClawSelect(null)
                            onAgentSelect(null, null)
                        }}
                        panelOpen={!!selectedClaw || !!selectedAgent}
                        selectedClawId={selectedClawId}
                        selectedAgentId={selectedAgentId}
                        selectedAgentClawId={selectedAgentClawId}
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

                    {selectedAgent && selectedAgentClaw && (
                        <PlaygroundAgentDetailPanel
                            key={`agent-panel-${selectedAgent.id}`}
                            agent={selectedAgent}
                            clawId={selectedAgentClaw.id}
                            clawName={selectedAgentClaw.name}
                            isOnlyAgent={isSelectedAgentOnly}
                            gatewayToken={selectedAgentClaw.gatewayToken}
                            subdomain={selectedAgentClaw.subdomain}
                            initialTab={playgroundAgentTab || undefined}
                            onTabChange={onPlaygroundAgentTabChange}
                            onClose={() => {
                                onAgentSelect(null, null)
                            }}
                            onGoToVersions={() => {
                                onAgentSelect(null, null)
                                onClawSelect(selectedAgentClaw.id)
                                onPlaygroundClawTabChange('versions')
                            }}
                        />
                    )}
                </AnimatePresence>
            </motion.div>
        </Suspense>
    )
}

export default DashboardPlaygroundView