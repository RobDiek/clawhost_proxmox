import type { FC, ReactNode } from 'react'
import type { AffiliateConfirmDialogProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui'
import { CircleNotchIcon } from '@phosphor-icons/react'

const AffiliateConfirmDialog: FC<AffiliateConfirmDialogProps> = ({
    open,
    onOpenChange,
    onConfirm,
    isPending
}): ReactNode => {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {t('affiliate.confirmChangeTitle')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('affiliate.confirmChangeDescription')}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant='ghost' onClick={() => onOpenChange(false)}>
                        {t('common.cancel')}
                    </Button>
                    <Button onClick={onConfirm} disabled={isPending}>
                        {isPending ? (
                            <CircleNotchIcon className='h-4 w-4 animate-spin' />
                        ) : (
                            t('common.confirm')
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default AffiliateConfirmDialog