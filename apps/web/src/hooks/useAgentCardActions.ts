import type {
    AgentCardActions,
    ErrorWithMessage,
    ExportRateLimitError,
    UseAgentCardActionsParams,
    UseAgentCardActionsReturn
} from '@/ts/Interfaces'

import { useState, useMemo } from 'react'
import { t } from '@openclaw/i18n'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { api, isSafeRedirectUrl } from '@/lib'
import {
    useStartAgent,
    useStopAgent,
    useRestartAgent,
    useDeleteAgent,
    useCancelDeletion,
    useHardDeleteAgent,
    useReinstallAgent,
    useCancelPendingAgent,
    useCustomerPortal
} from '@/hooks'

const useAgentCardActions = ({
    agent
}: UseAgentCardActionsParams): UseAgentCardActionsReturn => {
    const { showToast } = useUIStore()

    const [showStartModal, setShowStartModal] = useState(false)
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [showStopModal, setShowStopModal] = useState(false)
    const [showRestartModal, setShowRestartModal] = useState(false)
    const [showHardDeleteModal, setShowHardDeleteModal] = useState(false)
    const [showDiagnostics, setShowDiagnostics] = useState(false)
    const [showLogs, setShowLogs] = useState(false)
    const [showReinstallModal, setShowReinstallModal] = useState(false)
    const [showCancelDeletionModal, setShowCancelDeletionModal] =
        useState(false)
    const [showCredentials, setShowCredentials] = useState(false)
    const [credentialsPassword, setCredentialsPassword] = useState<
        string | null
    >(null)
    const [isFetchingCredentials, setIsFetchingCredentials] = useState(false)
    const [isExporting, setIsExporting] = useState(false)
    const { openPortal, isLoading: isPortalLoading } = useCustomerPortal()

    const startMutation = useStartAgent()
    const stopMutation = useStopAgent()
    const restartMutation = useRestartAgent()
    const deleteMutation = useDeleteAgent()
    const cancelDeletionMutation = useCancelDeletion()
    const hardDeleteMutation = useHardDeleteAgent()
    const reinstallMutation = useReinstallAgent()
    const cancelPendingMutation = useCancelPendingAgent()

    const isMutating =
        startMutation.isPending ||
        stopMutation.isPending ||
        restartMutation.isPending ||
        deleteMutation.isPending ||
        cancelDeletionMutation.isPending ||
        hardDeleteMutation.isPending ||
        reinstallMutation.isPending ||
        cancelPendingMutation.isPending ||
        isExporting ||
        isFetchingCredentials ||
        isPortalLoading

    const actions = useMemo((): AgentCardActions | null => {
        if (!agent) return null
        const target = agent

        const handleExport = async () => {
            setIsExporting(true)
            try {
                await api.exportAgent(
                    target.id,
                    `${target.name}-${Math.random().toString(36).slice(2, 5)}-export.tar.gz`
                )
                showToast(t('dashboard.exportSuccess'), TOAST_TYPE.SUCCESS)
            } catch (error) {
                const retryAfter = (error as ExportRateLimitError).retryAfter
                if (retryAfter && retryAfter > 30) {
                    showToast(
                        t('dashboard.exportRateLimited', {
                            minutes: String(Math.ceil(retryAfter / 60))
                        }),
                        TOAST_TYPE.WARNING
                    )
                } else if (retryAfter && retryAfter > 0) {
                    showToast(
                        t('dashboard.exportRateLimitedSeconds', {
                            seconds: String(retryAfter)
                        }),
                        TOAST_TYPE.WARNING
                    )
                } else {
                    showToast(t('dashboard.exportFailed'), TOAST_TYPE.ERROR)
                }
            } finally {
                setIsExporting(false)
            }
        }

        const handleShowCredentials = async () => {
            setIsFetchingCredentials(true)
            try {
                if (target.hasRootPassword) {
                    const res = await api.getAgentCredentials(target.id)
                    setCredentialsPassword(res.rootPassword || null)
                } else {
                    setCredentialsPassword(null)
                }
                setShowCredentials(true)
            } catch (error) {
                console.error('handleShowCredentials', error)
                showToast(t('errors.noPasswordAvailable'), TOAST_TYPE.ERROR)
            } finally {
                setIsFetchingCredentials(false)
            }
        }

        return {
            onStart: () =>
                startMutation.mutate(target.id, {
                    onError: (err) => {
                        const message =
                            err instanceof Error
                                ? err.message
                                : typeof err === 'object' &&
                                    err !== null &&
                                    'message' in err
                                  ? String((err as ErrorWithMessage).message)
                                  : t('dashboard.startFailed')
                        showToast(message, TOAST_TYPE.ERROR)
                    }
                }),
            onShowStartModal: () => setShowStartModal(true),
            onShowStopModal: () => setShowStopModal(true),
            onShowRestartModal: () => setShowRestartModal(true),
            onShowDeleteModal: () => setShowDeleteModal(true),
            onCancelDeletion: () => setShowCancelDeletionModal(true),
            onShowHardDeleteModal: () => setShowHardDeleteModal(true),
            onShowDiagnostics: () => setShowDiagnostics(true),
            onShowLogs: () => setShowLogs(true),
            onShowReinstallModal: () => setShowReinstallModal(true),
            onShowCredentials: handleShowCredentials,
            onExport: handleExport,
            onResumeCheckout: () => {
                if (target.checkoutUrl && isSafeRedirectUrl(target.checkoutUrl))
                    window.open(target.checkoutUrl, '_blank')
            },
            onCancelPending: () =>
                cancelPendingMutation.mutate(target.id.replace('pending-', '')),
            onUpdatePayment: () => openPortal(target.id)
        }
    }, [
        agent,
        showToast,
        startMutation,
        cancelDeletionMutation,
        cancelPendingMutation
    ])

    const dialogsProps = useMemo(() => {
        if (!agent) return null
        return {
            agentId: agent.id,
            agentName: agent.name,
            agentType: agent.agentType,
            agentIp: agent.ip || '',
            showStartModal,
            setShowStartModal,
            showDeleteModal,
            setShowDeleteModal,
            showStopModal,
            setShowStopModal,
            showRestartModal,
            setShowRestartModal,
            showHardDeleteModal,
            setShowHardDeleteModal,
            showReinstallModal,
            setShowReinstallModal,
            showDiagnostics,
            setShowDiagnostics,
            showLogs,
            setShowLogs,
            showCredentials,
            setShowCredentials,
            credentialsPassword,
            onStart: () =>
                startMutation.mutate(agent.id, {
                    onError: (err) => {
                        const message =
                            err instanceof Error
                                ? err.message
                                : typeof err === 'object' &&
                                    err !== null &&
                                    'message' in err
                                  ? String((err as ErrorWithMessage).message)
                                  : t('dashboard.startFailed')
                        showToast(message, TOAST_TYPE.ERROR)
                    }
                }),
            onDelete: () => deleteMutation.mutate(agent.id),
            onStop: () => stopMutation.mutate(agent.id),
            onRestart: () => restartMutation.mutate(agent.id),
            onHardDelete: () => hardDeleteMutation.mutate(agent.id),
            onReinstall: () =>
                reinstallMutation.mutate(agent.id, {
                    onSuccess: () =>
                        showToast(
                            t('dashboard.reinstallInstanceSuccess'),
                            TOAST_TYPE.SUCCESS
                        ),
                    onError: (err: Error) =>
                        showToast(
                            err.message ||
                                t('dashboard.reinstallInstanceFailed'),
                            TOAST_TYPE.ERROR
                        )
                }),
            isStartPending: startMutation.isPending,
            isDeletePending: deleteMutation.isPending,
            isStopPending: stopMutation.isPending,
            isRestartPending: restartMutation.isPending,
            isHardDeletePending: hardDeleteMutation.isPending,
            isReinstallPending: reinstallMutation.isPending,
            showCancelDeletionModal,
            setShowCancelDeletionModal,
            onCancelDeletion: () => cancelDeletionMutation.mutate(agent.id),
            isCancelDeletionPending: cancelDeletionMutation.isPending
        }
    }, [
        agent,
        showStartModal,
        showDeleteModal,
        showStopModal,
        showRestartModal,
        showHardDeleteModal,
        showReinstallModal,
        showCancelDeletionModal,
        showDiagnostics,
        showLogs,
        showCredentials,
        credentialsPassword,
        deleteMutation,
        stopMutation,
        restartMutation,
        hardDeleteMutation,
        reinstallMutation,
        showToast
    ])

    return { actions, isMutating, dialogsProps }
}

export default useAgentCardActions