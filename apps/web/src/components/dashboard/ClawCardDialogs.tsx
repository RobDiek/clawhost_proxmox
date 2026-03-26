import type { FC, ReactNode } from 'react'
import type { ClawCardDialogsProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { t } from '@openclaw/i18n'
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui'
import { CircleNotchIcon } from '@phosphor-icons/react'

const ClawCardDialogs: FC<ClawCardDialogsProps> = ({
    clawName,
    showDeleteModal,
    setShowDeleteModal,
    showStopModal,
    setShowStopModal,
    showRestartModal,
    setShowRestartModal,
    showHardDeleteModal,
    setShowHardDeleteModal,
    onDelete,
    onStop,
    onRestart,
    onHardDelete,
    isDeletePending,
    isStopPending,
    isRestartPending,
    isHardDeletePending,
    showReinstallModal,
    setShowReinstallModal,
    onReinstall,
    isReinstallPending
}): ReactNode => {
    return (
        <Fragment>
            <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('dashboard.deleteClaw')}</DialogTitle>
                        <DialogDescription>
                            {t('dashboard.deleteClawConfirmation')}{' '}
                            <strong>{clawName}</strong>?{' '}
                            {t('dashboard.deleteClawWarning')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className='mt-4 flex justify-end gap-3'>
                        <Button
                            variant='outline'
                            onClick={() => setShowDeleteModal(false)}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant='destructive'
                            onClick={() => {
                                onDelete()
                                setShowDeleteModal(false)
                            }}
                            disabled={isDeletePending}
                        >
                            {isDeletePending && (
                                <CircleNotchIcon className='mr-2 h-4 w-4 animate-spin' />
                            )}
                            {t('common.confirm')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={showStopModal} onOpenChange={setShowStopModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('dashboard.stopClaw')}</DialogTitle>
                        <DialogDescription>
                            {t('dashboard.stopClawConfirmation')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className='mt-4 flex justify-end gap-3'>
                        <Button
                            variant='outline'
                            onClick={() => setShowStopModal(false)}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant='destructive'
                            onClick={() => {
                                onStop()
                                setShowStopModal(false)
                            }}
                            disabled={isStopPending}
                        >
                            {isStopPending && (
                                <CircleNotchIcon className='mr-2 h-4 w-4 animate-spin' />
                            )}
                            {t('common.confirm')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={showRestartModal} onOpenChange={setShowRestartModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('dashboard.restartClaw')}</DialogTitle>
                        <DialogDescription>
                            {t('dashboard.restartClawConfirmation')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className='mt-4 flex justify-end gap-3'>
                        <Button
                            variant='outline'
                            onClick={() => setShowRestartModal(false)}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant='destructive'
                            onClick={() => {
                                onRestart()
                                setShowRestartModal(false)
                            }}
                            disabled={isRestartPending}
                        >
                            {isRestartPending && (
                                <CircleNotchIcon className='mr-2 h-4 w-4 animate-spin' />
                            )}
                            {t('common.confirm')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog
                open={showHardDeleteModal}
                onOpenChange={setShowHardDeleteModal}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {t('dashboard.hardDeleteClaw')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('dashboard.hardDeleteConfirmation')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className='mt-4 flex justify-end gap-3'>
                        <Button
                            variant='outline'
                            onClick={() => setShowHardDeleteModal(false)}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant='destructive'
                            onClick={() => {
                                onHardDelete()
                                setShowHardDeleteModal(false)
                            }}
                            disabled={isHardDeletePending}
                        >
                            {isHardDeletePending && (
                                <CircleNotchIcon className='mr-2 h-4 w-4 animate-spin' />
                            )}
                            {t('common.confirm')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog
                open={showReinstallModal}
                onOpenChange={setShowReinstallModal}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {t('dashboard.reinstallClaw')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('dashboard.reinstallClawConfirmation')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className='mt-4 flex justify-end gap-3'>
                        <Button
                            variant='outline'
                            onClick={() => setShowReinstallModal(false)}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant='destructive'
                            onClick={() => {
                                onReinstall()
                                setShowReinstallModal(false)
                            }}
                            disabled={isReinstallPending}
                        >
                            {isReinstallPending && (
                                <CircleNotchIcon className='mr-2 h-4 w-4 animate-spin' />
                            )}
                            {t('common.confirm')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </Fragment>
    )
}

export default ClawCardDialogs