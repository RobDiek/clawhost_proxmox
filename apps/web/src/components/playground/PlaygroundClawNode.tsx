import type { FC, ReactNode } from 'react'
import type {
    ClawCardActions,
    ErrorWithMessage,
    ExportRateLimitError,
    PlaygroundClawNodeProps
} from '@/ts/Interfaces'

import { useState } from 'react'
import { t } from '@openclaw/i18n'
import { clawStatus, clawProvider, userRole } from '@openclaw/shared'
import { useUIStore } from '@/lib/store'
import { api, getLocale, getBaseDomain, TRUNCATE_LENGTHS } from '@/lib'
import {
    useStartClaw,
    useStopClaw,
    useRestartClaw,
    useDeleteClaw,
    useCancelDeletion,
    useHardDeleteClaw,
    useRepairClaw,
    useReinstallClaw,
    useProfile,
    useCancelPendingClaw
} from '@/hooks'
import { ProviderIcon } from '@/components'
import { getStatusConfig, generateSlug } from '@/lib/claw-utils'
import {
    PlusIcon,
    ClockIcon,
    CircleNotchIcon,
    AndroidLogoIcon
} from '@phosphor-icons/react'
import {
    ClawCardDropdownMenu,
    ClawCardDialogs,
    ClawCredentialsDialog,
    ClawDiagnosticsDialog,
    ClawLogsDialog,
    ClawConfigDialog
} from '@/components/dashboard'
import { CreateAgentModal } from '@/components/playground'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui'
import { Handle, Position } from '@xyflow/react'

const handleStyle = {
    bottom: 0,
    width: 0,
    height: 0,
    minWidth: 0,
    minHeight: 0,
    border: 'none',
    background: 'none',
    opacity: 0
}

const PlaygroundClawNode: FC<PlaygroundClawNodeProps> = ({
    data
}): ReactNode => {
    const { claw, agentCount, isLoadingAgents, isSelected, readOnly } = data
    const statusConfigs = getStatusConfig()
    const status = statusConfigs[claw.status] || statusConfigs.unknown

    const isRunning = claw.status === clawStatus.running
    const isUnreachable = claw.status === clawStatus.unreachable
    const canShowAgents = isRunning || isUnreachable

    const { showToast } = useUIStore()
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [showStopModal, setShowStopModal] = useState(false)
    const [showRestartModal, setShowRestartModal] = useState(false)
    const [showHardDeleteModal, setShowHardDeleteModal] = useState(false)
    const [showDiagnostics, setShowDiagnostics] = useState(false)
    const [showLogs, setShowLogs] = useState(false)
    const [showConfig, setShowConfig] = useState(false)
    const [showReinstallModal, setShowReinstallModal] = useState(false)
    const [showCredentials, setShowCredentials] = useState(false)
    const [credentialsPassword, setCredentialsPassword] = useState<
        string | null
    >(null)
    const [isFetchingCredentials, setIsFetchingCredentials] = useState(false)
    const [isExporting, setIsExporting] = useState(false)
    const [showAddAgent, setShowAddAgent] = useState(false)

    const startMutation = useStartClaw()
    const stopMutation = useStopClaw()
    const restartMutation = useRestartClaw()
    const deleteMutation = useDeleteClaw()
    const cancelDeletionMutation = useCancelDeletion()
    const hardDeleteMutation = useHardDeleteClaw()
    const repairMutation = useRepairClaw()
    const reinstallMutation = useReinstallClaw()
    const cancelPendingMutation = useCancelPendingClaw()

    const { data: profile } = useProfile({ enabled: true })

    const isMutating =
        startMutation.isPending ||
        stopMutation.isPending ||
        restartMutation.isPending ||
        deleteMutation.isPending ||
        cancelDeletionMutation.isPending ||
        hardDeleteMutation.isPending ||
        repairMutation.isPending ||
        reinstallMutation.isPending ||
        cancelPendingMutation.isPending ||
        isExporting ||
        isFetchingCredentials

    const isScheduledForDeletion = !!claw.deletionScheduledAt
    const hasActionItems =
        claw.status === clawStatus.running || claw.status === clawStatus.stopped

    const handleUpdateInstance = () => {
        repairMutation.mutate(claw.id, {
            onSuccess: () => {
                showToast(t('dashboard.updateInstanceSuccess'), 'success')
            },
            onError: () => {
                showToast(t('dashboard.updateInstanceFailed'), 'error')
            }
        })
    }

    const handleExport = async () => {
        setIsExporting(true)
        try {
            await api.exportClaw(claw.id, `${claw.name}-${Math.random().toString(36).slice(2, 5)}-export.tar.gz`)
            showToast(t('dashboard.exportSuccess'), 'success')
        } catch (err) {
            const retryAfter = (err as ExportRateLimitError).retryAfter
            if (retryAfter && retryAfter > 30) {
                const minutes = Math.ceil(retryAfter / 60)
                showToast(
                    t('dashboard.exportRateLimited', {
                        minutes: String(minutes)
                    }),
                    'warning'
                )
            } else if (retryAfter && retryAfter > 0) {
                showToast(
                    t('dashboard.exportRateLimitedSeconds', {
                        seconds: String(retryAfter)
                    }),
                    'warning'
                )
            } else {
                showToast(t('dashboard.exportFailed'), 'error')
            }
        } finally {
            setIsExporting(false)
        }
    }

    const handleReinstall = () => {
        reinstallMutation.mutate(claw.id, {
            onSuccess: () => {
                showToast(t('dashboard.reinstallInstanceSuccess'), 'success')
            },
            onError: (err: Error) => {
                showToast(
                    err.message || t('dashboard.reinstallInstanceFailed'),
                    'error'
                )
            }
        })
    }

    const handleShowCredentials = async () => {
        setIsFetchingCredentials(true)
        try {
            if (claw.hasRootPassword) {
                const res = await api.getClawCredentials(claw.id)
                setCredentialsPassword(res.rootPassword || null)
            } else {
                setCredentialsPassword(null)
            }
            setShowCredentials(true)
        } catch {
            showToast(t('errors.noPasswordAvailable'), 'error')
        } finally {
            setIsFetchingCredentials(false)
        }
    }

    const actions: ClawCardActions = {
        onStart: () =>
            startMutation.mutate(claw.id, {
                onError: (err) => {
                    const message =
                        err instanceof Error
                            ? err.message
                            : typeof err === 'object' &&
                                err !== null &&
                                'message' in err
                              ? String((err as ErrorWithMessage).message)
                              : t('dashboard.startFailed')
                    showToast(message, 'error')
                }
            }),
        onShowStopModal: () => setShowStopModal(true),
        onShowRestartModal: () => setShowRestartModal(true),
        onShowDeleteModal: () => setShowDeleteModal(true),
        onCancelDeletion: () => cancelDeletionMutation.mutate(claw.id),
        onShowHardDeleteModal: () => setShowHardDeleteModal(true),
        onShowDiagnostics: () => setShowDiagnostics(true),
        onShowLogs: () => setShowLogs(true),
        onShowConfig: () => setShowConfig(true),
        onUpdateInstance: handleUpdateInstance,
        onShowReinstallModal: () => setShowReinstallModal(true),
        onShowCredentials: handleShowCredentials,
        onExport: handleExport,
        onResumeCheckout: () => {
            if (claw.checkoutUrl) {
                window.open(claw.checkoutUrl, '_blank')
            }
        },
        onCancelPending: () => {
            const pendingId = claw.id.replace('pending-', '')
            cancelPendingMutation.mutate(pendingId)
        }
    }

    return (
        <>
            <div
                className={`playground-node-enter bg-popover relative w-[280px] cursor-pointer rounded-xl border ${
                    isSelected
                        ? 'border-[#ef5350]/50 shadow-[0_0_20px_rgba(239,83,80,0.15)]'
                        : !canShowAgents
                          ? 'border-border opacity-50'
                          : 'border-border'
                } ${isRunning && !isSelected ? 'shadow-[0_0_30px_rgba(239,83,80,0.08)]' : ''}`}
            >
                <div className='border-border flex items-center gap-2 border-b px-4 py-3'>
                    <ProviderIcon
                        provider={claw.provider}
                        className='h-5 w-5'
                    />
                    <div className='flex flex-1 items-center gap-2 overflow-hidden'>
                        {claw.name.length > TRUNCATE_LENGTHS.NODE_CLAW_NAME ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className='text-foreground truncate text-sm font-semibold'>
                                        {claw.name.slice(
                                            0,
                                            TRUNCATE_LENGTHS.NODE_CLAW_NAME
                                        )}
                                        ...
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent>{claw.name}</TooltipContent>
                            </Tooltip>
                        ) : (
                            <span className='text-foreground truncate text-sm font-semibold'>
                                {claw.name}
                            </span>
                        )}
                        <span
                            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${status.bgColor}`}
                        >
                            {status.pulse ? (
                                <CircleNotchIcon
                                    className={`h-3 w-3 animate-spin ${status.color.replace('bg-', 'text-')}`}
                                    weight='bold'
                                />
                            ) : (
                                <span
                                    className={`h-1.5 w-1.5 rounded-full ${status.color} status-dot-alive`}
                                />
                            )}
                            {status.label}
                        </span>
                    </div>
                    {!readOnly && (
                        <>
                            <div
                                className='flex shrink-0 items-center'
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                <ClawCardDropdownMenu
                                    claw={claw}
                                    actions={actions}
                                    isLoading={isMutating}
                                    hasActionItems={hasActionItems}
                                    isScheduledForDeletion={
                                        isScheduledForDeletion
                                    }
                                    isAdmin={profile?.role === userRole.admin}
                                    compact
                                />
                            </div>
                            {canShowAgents && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                if (!isLoadingAgents)
                                                    setShowAddAgent(true)
                                            }}
                                            onPointerDown={(e) =>
                                                e.stopPropagation()
                                            }
                                            onMouseDown={(e) =>
                                                e.stopPropagation()
                                            }
                                            disabled={isLoadingAgents}
                                            className={`shrink-0 rounded-md p-1 transition-colors ${
                                                isLoadingAgents
                                                    ? 'text-muted-foreground/50 cursor-not-allowed'
                                                    : 'text-muted-foreground hover:bg-foreground/10 hover:text-foreground'
                                            }`}
                                        >
                                            <PlusIcon
                                                className='h-3.5 w-3.5'
                                                weight='bold'
                                            />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side='top'>
                                        <p>{t('playground.addAgent')}</p>
                                    </TooltipContent>
                                </Tooltip>
                            )}
                        </>
                    )}
                </div>

                {canShowAgents && (
                    <div className='px-4 py-3'>
                        {claw.status === clawStatus.running &&
                            agentCount > 0 &&
                            (claw.provider === clawProvider.local &&
                            claw.subdomain ? (
                                <p className='text-muted-foreground mb-2 truncate text-xs'>
                                    {claw.subdomain}.clawhost
                                </p>
                            ) : claw.provider !== clawProvider.local ? (
                                <p className='text-muted-foreground mb-2 truncate text-xs'>
                                    {claw.subdomain || generateSlug(claw.id)}.
                                    {getBaseDomain()}
                                </p>
                            ) : null)}

                        <div className='flex items-center gap-2'>
                            {isLoadingAgents ? (
                                <div className='bg-foreground/5 flex items-center gap-1.5 rounded-md px-2 py-1'>
                                    <div className='border-border border-t-foreground/40 h-3 w-3 animate-spin rounded-full border' />
                                    <span className='text-muted-foreground text-xs'>
                                        {t('playground.loadingAgents')}
                                    </span>
                                </div>
                            ) : isUnreachable ? (
                                <div className='bg-muted-foreground/10 flex items-center gap-1.5 rounded-md px-2 py-1'>
                                    <span className='text-muted-foreground text-xs'>
                                        {t('playground.offline')}
                                    </span>
                                </div>
                            ) : agentCount === 0 ? (
                                <div className='bg-foreground/5 flex items-center gap-1.5 rounded-md px-2 py-1'>
                                    <span className='text-muted-foreground text-xs'>
                                        {t('playground.noAgents')}
                                    </span>
                                </div>
                            ) : (
                                <div className='flex items-center gap-1.5 rounded-md bg-[#ef5350]/10 px-2 py-1'>
                                    <AndroidLogoIcon
                                        className='h-3 w-3 text-[#ef5350]'
                                        weight='fill'
                                    />
                                    <span className='text-xs text-[#ef5350]'>
                                        {agentCount === 1
                                            ? t('playground.agentCount', {
                                                  count: String(agentCount)
                                              })
                                            : t('playground.agentCountPlural', {
                                                  count: String(agentCount)
                                              })}
                                    </span>
                                </div>
                            )}
                            {isScheduledForDeletion && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className='bg-muted-foreground/10 flex items-center gap-1.5 rounded-md px-2 py-1'>
                                            <ClockIcon
                                                className='text-muted-foreground h-3 w-3'
                                                weight='fill'
                                            />
                                            <span className='text-muted-foreground text-xs'>
                                                {t(
                                                    'dashboard.scheduledDeletionShort',
                                                    {
                                                        date: new Date(
                                                            claw.deletionScheduledAt!
                                                        ).toLocaleDateString(
                                                            getLocale(),
                                                            {
                                                                month: 'short',
                                                                day: 'numeric'
                                                            }
                                                        )
                                                    }
                                                )}
                                            </span>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side='top'>
                                        <p>
                                            {t(
                                                'dashboard.scheduledForDeletion'
                                            )}
                                        </p>
                                    </TooltipContent>
                                </Tooltip>
                            )}
                        </div>
                    </div>
                )}
                {!canShowAgents && isScheduledForDeletion && (
                    <div className='px-4 py-3'>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className='bg-muted-foreground/10 flex items-center gap-1.5 rounded-md px-2 py-1'>
                                    <ClockIcon
                                        className='text-muted-foreground h-3 w-3'
                                        weight='fill'
                                    />
                                    <span className='text-muted-foreground text-xs'>
                                        {t('dashboard.scheduledDeletionShort', {
                                            date: new Date(
                                                claw.deletionScheduledAt!
                                            ).toLocaleDateString(getLocale(), {
                                                month: 'short',
                                                day: 'numeric'
                                            })
                                        })}
                                    </span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side='top'>
                                <p>{t('dashboard.scheduledForDeletion')}</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                )}

                <Handle
                    type='source'
                    position={Position.Bottom}
                    isConnectable={false}
                    style={handleStyle}
                />
            </div>
            <ClawCardDialogs
                clawName={claw.name}
                showDeleteModal={showDeleteModal}
                setShowDeleteModal={setShowDeleteModal}
                showStopModal={showStopModal}
                setShowStopModal={setShowStopModal}
                showRestartModal={showRestartModal}
                setShowRestartModal={setShowRestartModal}
                showHardDeleteModal={showHardDeleteModal}
                setShowHardDeleteModal={setShowHardDeleteModal}
                onDelete={() => deleteMutation.mutate(claw.id)}
                onStop={() => stopMutation.mutate(claw.id)}
                onRestart={() => restartMutation.mutate(claw.id)}
                onHardDelete={() => hardDeleteMutation.mutate(claw.id)}
                isDeletePending={deleteMutation.isPending}
                isStopPending={stopMutation.isPending}
                isRestartPending={restartMutation.isPending}
                isHardDeletePending={hardDeleteMutation.isPending}
                showReinstallModal={showReinstallModal}
                setShowReinstallModal={setShowReinstallModal}
                onReinstall={handleReinstall}
                isReinstallPending={reinstallMutation.isPending}
            />
            <ClawDiagnosticsDialog
                clawId={claw.id}
                open={showDiagnostics}
                onOpenChange={setShowDiagnostics}
            />
            <ClawLogsDialog
                clawId={claw.id}
                open={showLogs}
                onOpenChange={setShowLogs}
            />
            <ClawConfigDialog
                clawId={claw.id}
                open={showConfig}
                onOpenChange={setShowConfig}
            />
            <ClawCredentialsDialog
                clawIp={claw.ip || ''}
                rootPassword={credentialsPassword}
                open={showCredentials}
                onOpenChange={setShowCredentials}
            />
            <CreateAgentModal
                clawId={claw.id}
                clawName={claw.name}
                open={showAddAgent}
                onOpenChange={setShowAddAgent}
            />
        </>
    )
}

export default PlaygroundClawNode