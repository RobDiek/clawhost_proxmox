import type { FC, ReactNode } from 'react'
import type { AgentDeleteDialogProps } from '@/ts/Interfaces'

import { useState, useCallback } from 'react'
import { t } from '@openclaw/i18n'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    Checkbox
} from '@/components/ui'

const AgentDeleteDialog: FC<AgentDeleteDialogProps> = ({
    open,
    onOpenChange,
    agentName,
    onConfirm
}): ReactNode => {
    const [dontAskAgain, setDontAskAgain] = useState(false)

    const handleConfirm = useCallback(() => {
        onConfirm(dontAskAgain)
    }, [dontAskAgain, onConfirm])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className='max-w-sm'>
                <DialogHeader>
                    <DialogTitle>
                        {t('playground.deleteAgentTitle')}
                    </DialogTitle>
                    <DialogDescription className='w-[90%]'>
                        {t('playground.deleteAgentDescription', {
                            agentName
                        })}
                    </DialogDescription>
                </DialogHeader>
                <label className='mt-3 flex cursor-pointer items-center gap-2.5'>
                    <Checkbox
                        checked={dontAskAgain}
                        onCheckedChange={(checked) =>
                            setDontAskAgain(!!checked)
                        }
                    />
                    <span className='text-muted-foreground text-xs'>
                        {t('playground.agentDontAskAgain')}
                    </span>
                </label>
                <div className='mt-4 flex justify-end gap-3'>
                    <button
                        onClick={() => onOpenChange(false)}
                        className='text-muted-foreground hover:text-foreground rounded-lg px-4 py-2 text-sm font-medium transition-colors'
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={handleConfirm}
                        className='rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700'
                    >
                        {t('playground.deleteAgentConfirm')}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default AgentDeleteDialog