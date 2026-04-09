import type {
    ClawCardActions,
    ErrorWithMessage,
    ExportRateLimitError,
    UseClawCardActionsParams,
    UseClawCardActionsReturn
} from '@/ts/Interfaces'

import { useState, useMemo } from 'react'
import { t } from '@openclaw/i18n'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { api } from '@/lib'
import {
    useStartClaw,
    useStopClaw,
    useRestartClaw,
    useDeleteClaw,
    useCancelDeletion,
    useHardDeleteClaw,
    useRepairClaw,
    useReinstallClaw,
    useCancelPendingClaw
} from '@/hooks'

const useClawCardActions = ({
    claw
}: UseClawCardActionsParams): UseClawCardActionsReturn => {
    const { showToast } = useUIStore()

    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [showStopModal, setShowStopModal] = useState(false)
    const [showRestartModal, setShowRestartModal] = useState(false)
    const [showHardDeleteModal, setShowHardDeleteModal] = useState(false)
    const [showDiagnostics, setShowDiagnostics] = useState(false)
    const [showLogs, setShowLogs] = useState(false)
    const [showConfigDialog, setShowConfigDialog] = useState(false)
    const [showReinstallModal, setShowReinstallModal] = useState(false)
    const [showCredentials, setShowCredentials] = useState(false)
    const [credentialsPassword, setCredentialsPassword] = useState<
        string | null
    >(null)
    const [isFetchingCredentials, setIsFetchingCredentials] = useState(false)
    const [isExporting, setIsExporting] = useState(false)

    const startMutation = useStartClaw()
    const stopMutation = useStopClaw()
    const restartMutation = useRestartClaw()
    const deleteMutation = useDeleteClaw()
    const cancelDeletionMutation = useCancelDeletion()
    const hardDeleteMutation = useHardDeleteClaw()
    const repairMutation = useRepairClaw()
    const reinstallMutation = useReinstallClaw()
    const cancelPendingMutation = useCancelPendingClaw()

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

    const actions = useMemo((): ClawCardActions | null => {
        if (!claw) return null
        const target = claw

        const handleExport = async () => {
            setIsExporting(true)
            try {
                await api.exportClaw(
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
                    const res = await api.getClawCredentials(target.id)
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
            onShowStopModal: () => setShowStopModal(true),
            onShowRestartModal: () => setShowRestartModal(true),
            onShowDeleteModal: () => setShowDeleteModal(true),
            onCancelDeletion: () => cancelDeletionMutation.mutate(target.id),
            onShowHardDeleteModal: () => setShowHardDeleteModal(true),
            onShowDiagnostics: () => setShowDiagnostics(true),
            onShowLogs: () => setShowLogs(true),
            onShowConfig: () => setShowConfigDialog(true),
            onUpdateInstance: () =>
                repairMutation.mutate(target.id, {
                    onSuccess: () =>
                        showToast(
                            t('dashboard.updateInstanceSuccess'),
                            TOAST_TYPE.SUCCESS
                        ),
                    onError: () =>
                        showToast(
                            t('dashboard.updateInstanceFailed'),
                            TOAST_TYPE.ERROR
                        )
                }),
            onShowReinstallModal: () => setShowReinstallModal(true),
            onShowCredentials: handleShowCredentials,
            onExport: handleExport,
            onResumeCheckout: () => {
                if (target.checkoutUrl)
                    window.open(target.checkoutUrl, '_blank')
            },
            onCancelPending: () =>
                cancelPendingMutation.mutate(target.id.replace('pending-', ''))
        }
    }, [
        claw,
        showToast,
        startMutation,
        cancelDeletionMutation,
        repairMutation,
        cancelPendingMutation
    ])

    const dialogsProps = useMemo(() => {
        if (!claw) return null
        return {
            clawId: claw.id,
            clawName: claw.name,
            clawIp: claw.ip || '',
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
            showConfigDialog,
            setShowConfigDialog,
            showCredentials,
            setShowCredentials,
            credentialsPassword,
            onDelete: () => deleteMutation.mutate(claw.id),
            onStop: () => stopMutation.mutate(claw.id),
            onRestart: () => restartMutation.mutate(claw.id),
            onHardDelete: () => hardDeleteMutation.mutate(claw.id),
            onReinstall: () =>
                reinstallMutation.mutate(claw.id, {
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
            isDeletePending: deleteMutation.isPending,
            isStopPending: stopMutation.isPending,
            isRestartPending: restartMutation.isPending,
            isHardDeletePending: hardDeleteMutation.isPending,
            isReinstallPending: reinstallMutation.isPending
        }
    }, [
        claw,
        showDeleteModal,
        showStopModal,
        showRestartModal,
        showHardDeleteModal,
        showReinstallModal,
        showDiagnostics,
        showLogs,
        showConfigDialog,
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

export default useClawCardActions