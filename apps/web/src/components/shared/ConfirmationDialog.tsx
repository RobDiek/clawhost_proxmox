import type { FC, ReactNode } from 'react'
import type { ConfirmationDialogProps } from '@/ts/Interfaces'

import { CircleNotchIcon } from '@phosphor-icons/react'
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

const ConfirmationDialog: FC<ConfirmationDialogProps> = ({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel,
    onConfirm,
    isPending,
    variant = 'default'
}): ReactNode => {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button
                        variant='outline'
                        onClick={() => onOpenChange(false)}
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button
                        variant={variant}
                        onClick={onConfirm}
                        disabled={isPending}
                    >
                        {isPending && (
                            <CircleNotchIcon className='mr-2 h-4 w-4 animate-spin' />
                        )}
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default ConfirmationDialog