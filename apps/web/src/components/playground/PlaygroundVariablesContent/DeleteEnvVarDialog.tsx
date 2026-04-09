import type { FC, ReactNode } from 'react'
import type { DeleteEnvVarDialogProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    Button,
    Checkbox
} from '@/components/ui'

const DeleteEnvVarDialog: FC<DeleteEnvVarDialogProps> = ({
    open,
    envKey,
    dontAskAgain,
    isPending,
    onOpenChange,
    onDontAskAgainChange,
    onConfirm
}): ReactNode => {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {t('playground.variablesDeleteTitle')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('playground.variablesDeleteDescription', {
                            key: envKey
                        })}
                    </DialogDescription>
                </DialogHeader>
                <label className='mt-3 flex cursor-pointer items-center gap-2.5'>
                    <Checkbox
                        checked={dontAskAgain}
                        onCheckedChange={(checked) =>
                            onDontAskAgainChange(!!checked)
                        }
                    />
                    <span className='text-muted-foreground text-xs'>
                        {t('playground.variablesDontAskAgain')}
                    </span>
                </label>
                <div className='mt-4 flex justify-end gap-3'>
                    <Button
                        variant='outline'
                        onClick={() => onOpenChange(false)}
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button
                        variant='destructive'
                        onClick={onConfirm}
                        disabled={isPending}
                    >
                        {t('playground.variablesDeleteConfirm')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default DeleteEnvVarDialog