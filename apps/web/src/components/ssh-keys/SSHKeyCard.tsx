import type { FC, ReactNode } from 'react'
import type { SSHKeyCardProps } from '@/ts/Interfaces'

import { Fragment, useState } from 'react'
import { t } from '@openclaw/i18n'
import { useDeleteSSHKey } from '@/hooks'
import {
    Button,
    Card,
    CardContent,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui'
import { KeyIcon, TrashIcon, CircleNotchIcon } from '@phosphor-icons/react'

const SSHKeyCard: FC<SSHKeyCardProps> = ({ sshKey }): ReactNode => {
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const deleteMutation = useDeleteSSHKey()

    return (
        <Fragment>
            <Card>
                <CardContent className='py-4'>
                    <div className='flex items-center justify-between'>
                        <div className='flex items-center gap-4'>
                            <div className='bg-muted flex h-10 w-10 items-center justify-center rounded-full'>
                                <KeyIcon className='text-muted-foreground h-5 w-5' />
                            </div>
                            <div>
                                <h3 className='font-semibold'>{sshKey.name}</h3>
                                <p className='text-muted-foreground font-mono text-sm'>
                                    {sshKey.fingerprint}
                                </p>
                            </div>
                        </div>

                        <Button
                            variant='ghost'
                            size='icon'
                            onClick={() => setShowDeleteModal(true)}
                            disabled={deleteMutation.isPending}
                        >
                            {deleteMutation.isPending ? (
                                <CircleNotchIcon className='h-5 w-5 animate-spin' />
                            ) : (
                                <TrashIcon className='text-destructive h-5 w-5' />
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('sshKeys.deleteKey')}</DialogTitle>
                        <DialogDescription>
                            {t('sshKeys.deleteKeyConfirmation')}{' '}
                            <strong>{sshKey.name}</strong>?
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
                                deleteMutation.mutate(sshKey.id)
                                setShowDeleteModal(false)
                            }}
                            disabled={deleteMutation.isPending}
                        >
                            {deleteMutation.isPending && (
                                <CircleNotchIcon className='h-4 w-4 animate-spin' />
                            )}
                            {t('common.confirm')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </Fragment>
    )
}

export default SSHKeyCard