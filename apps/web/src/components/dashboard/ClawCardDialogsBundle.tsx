import type { FC, ReactNode } from 'react'
import type { ClawCardDialogsBundleProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import ClawCardDialogs from '@/components/dashboard/ClawCardDialogs'
import ClawCredentialsDialog from '@/components/dashboard/ClawCredentialsDialog'
import ClawDiagnosticsDialog from '@/components/dashboard/ClawDiagnosticsDialog'
import ClawLogsDialog from '@/components/dashboard/ClawLogsDialog'
import ClawConfigDialog from '@/components/dashboard/ClawConfigDialog'

const ClawCardDialogsBundle: FC<ClawCardDialogsBundleProps> = ({
    clawId,
    clawName,
    clawIp,
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
    onDelete,
    onStop,
    onRestart,
    onHardDelete,
    onReinstall,
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
                showDeleteModal={showDeleteModal}
                setShowDeleteModal={setShowDeleteModal}
                showStopModal={showStopModal}
                setShowStopModal={setShowStopModal}
                showRestartModal={showRestartModal}
                setShowRestartModal={setShowRestartModal}
                showHardDeleteModal={showHardDeleteModal}
                setShowHardDeleteModal={setShowHardDeleteModal}
                onDelete={onDelete}
                onStop={onStop}
                onRestart={onRestart}
                onHardDelete={onHardDelete}
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
            <ClawConfigDialog
                clawId={clawId}
                open={showConfigDialog}
                onOpenChange={setShowConfigDialog}
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