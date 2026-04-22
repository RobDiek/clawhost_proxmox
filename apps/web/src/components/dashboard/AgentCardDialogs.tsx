import type { FC, ReactNode } from 'react'
import type { AgentCardDialogsProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { t } from '@openclaw/i18n'
import { ConfirmationDialog } from '@/components/shared'

const AgentCardDialogs: FC<AgentCardDialogsProps> = ({
    agentName,
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
    onStart,
    onDelete,
    onStop,
    onRestart,
    onHardDelete,
    isStartPending,
    isDeletePending,
    isStopPending,
    isRestartPending,
    isHardDeletePending,
    showReinstallModal,
    setShowReinstallModal,
    onReinstall,
    isReinstallPending,
    showCancelDeletionModal,
    setShowCancelDeletionModal,
    onCancelDeletion,
    isCancelDeletionPending
}): ReactNode => {
    return (
        <Fragment>
            <ConfirmationDialog
                open={showStartModal}
                onOpenChange={setShowStartModal}
                title={t('dashboard.startClaw')}
                description={t('dashboard.startClawConfirmation')}
                confirmLabel={t('common.confirm')}
                onConfirm={() => {
                    onStart()
                    setShowStartModal(false)
                }}
                isPending={isStartPending}
            />
            <ConfirmationDialog
                open={showDeleteModal}
                onOpenChange={setShowDeleteModal}
                title={t('dashboard.deleteClaw')}
                description={
                    <Fragment>
                        {t('dashboard.deleteClawConfirmation')}{' '}
                        <strong>{agentName}</strong>?{' '}
                        {t('dashboard.deleteClawWarning')}
                    </Fragment>
                }
                confirmLabel={t('common.confirm')}
                onConfirm={() => {
                    onDelete()
                    setShowDeleteModal(false)
                }}
                isPending={isDeletePending}
                variant='destructive'
            />
            <ConfirmationDialog
                open={showStopModal}
                onOpenChange={setShowStopModal}
                title={t('dashboard.stopClaw')}
                description={t('dashboard.stopClawConfirmation')}
                confirmLabel={t('common.confirm')}
                onConfirm={() => {
                    onStop()
                    setShowStopModal(false)
                }}
                isPending={isStopPending}
                variant='destructive'
            />
            <ConfirmationDialog
                open={showRestartModal}
                onOpenChange={setShowRestartModal}
                title={t('dashboard.restartClaw')}
                description={t('dashboard.restartClawConfirmation')}
                confirmLabel={t('common.confirm')}
                onConfirm={() => {
                    onRestart()
                    setShowRestartModal(false)
                }}
                isPending={isRestartPending}
                variant='destructive'
            />
            <ConfirmationDialog
                open={showHardDeleteModal}
                onOpenChange={setShowHardDeleteModal}
                title={t('dashboard.hardDeleteClaw')}
                description={t('dashboard.hardDeleteConfirmation')}
                confirmLabel={t('common.confirm')}
                onConfirm={() => {
                    onHardDelete()
                    setShowHardDeleteModal(false)
                }}
                isPending={isHardDeletePending}
                variant='destructive'
            />
            <ConfirmationDialog
                open={showReinstallModal}
                onOpenChange={setShowReinstallModal}
                title={t('dashboard.reinstallClaw')}
                description={t('dashboard.reinstallClawConfirmation')}
                confirmLabel={t('common.confirm')}
                onConfirm={() => {
                    onReinstall()
                    setShowReinstallModal(false)
                }}
                isPending={isReinstallPending}
                variant='destructive'
            />
            <ConfirmationDialog
                open={showCancelDeletionModal}
                onOpenChange={setShowCancelDeletionModal}
                title={t('dashboard.cancelDeletion')}
                description={t('dashboard.cancelDeletionConfirmation')}
                confirmLabel={t('common.confirm')}
                onConfirm={() => {
                    onCancelDeletion()
                    setShowCancelDeletionModal(false)
                }}
                isPending={isCancelDeletionPending}
            />
        </Fragment>
    )
}

export default AgentCardDialogs