import type { FC, ReactNode } from 'react'
import type { ClawCardDialogsBundleProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import ClawCardDialogs from '@/components/dashboard/ClawCardDialogs'
import ClawCredentialsDialog from '@/components/dashboard/ClawCredentialsDialog'
import ClawDiagnosticsDialog from '@/components/dashboard/ClawDiagnosticsDialog'
import ClawLogsDialog from '@/components/dashboard/ClawLogsDialog'

const ClawCardDialogsBundle: FC<ClawCardDialogsBundleProps> = ({
    clawId,
    clawName,
    clawIp,
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
    onStart,
    onDelete,
    onStop,
    onRestart,
    onHardDelete,
    onReinstall,
    isStartPending,
    isDeletePending,
    isStopPending,
    isRestartPending,
    isHardDeletePending,
    isReinstallPending
}): ReactNode => {
    return (
        <Fragment>
            <ClawCardDialogs
                clawName={clawName}
                showStartModal={showStartModal}
                setShowStartModal={setShowStartModal}
                showDeleteModal={showDeleteModal}
                setShowDeleteModal={setShowDeleteModal}
                showStopModal={showStopModal}
                setShowStopModal={setShowStopModal}
                showRestartModal={showRestartModal}
                setShowRestartModal={setShowRestartModal}
                showHardDeleteModal={showHardDeleteModal}
                setShowHardDeleteModal={setShowHardDeleteModal}
                onStart={onStart}
                onDelete={onDelete}
                onStop={onStop}
                onRestart={onRestart}
                onHardDelete={onHardDelete}
                isStartPending={isStartPending}
                isDeletePending={isDeletePending}
                isStopPending={isStopPending}
                isRestartPending={isRestartPending}
                isHardDeletePending={isHardDeletePending}
                showReinstallModal={showReinstallModal}
                setShowReinstallModal={setShowReinstallModal}
                onReinstall={onReinstall}
                isReinstallPending={isReinstallPending}
            />
            <ClawDiagnosticsDialog
                clawId={clawId}
                open={showDiagnostics}
                onOpenChange={setShowDiagnostics}
            />
            <ClawLogsDialog
                clawId={clawId}
                open={showLogs}
                onOpenChange={setShowLogs}
            />
            <ClawCredentialsDialog
                clawIp={clawIp}
                rootPassword={credentialsPassword}
                open={showCredentials}
                onOpenChange={setShowCredentials}
            />
        </Fragment>
    )
}

export default ClawCardDialogsBundle