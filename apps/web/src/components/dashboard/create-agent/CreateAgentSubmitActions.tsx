import type { FC, ReactNode } from 'react'
import type { CreateAgentSubmitActionsProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { Button } from '@/components/ui'
import { CircleNotchIcon } from '@phosphor-icons/react'

const CreateAgentSubmitActions: FC<CreateAgentSubmitActionsProps> = ({
    isLocal,
    isCreatingLocal,
    isPurchasing,
    selectedPlan,
    location,
    nameError,
    agreedToTerms,
    totalAmount,
    onCancel
}): ReactNode => {
    const submitLabel = (): string => {
        if (!selectedPlan) return t('createClaw.selectServerToContinue')
        if (!location) return t('createClaw.selectLocationToContinue')
        return t('createClaw.proceedToPayment', { amount: totalAmount })
    }

    return (
        <div className='flex justify-end gap-3'>
            <Button type='button' variant='ghost' onClick={onCancel}>
                {t('common.cancel')}
            </Button>
            {isLocal ? (
                <Button type='submit' disabled={isCreatingLocal || !!nameError}>
                    {isCreatingLocal && (
                        <CircleNotchIcon className='h-4 w-4 animate-spin' />
                    )}
                    {isCreatingLocal
                        ? t('createClaw.creating')
                        : t('createClaw.title')}
                </Button>
            ) : (
                <Button
                    type='submit'
                    disabled={
                        isPurchasing ||
                        !selectedPlan ||
                        !location ||
                        !!nameError ||
                        !agreedToTerms
                    }
                >
                    {isPurchasing && (
                        <CircleNotchIcon className='h-4 w-4 animate-spin' />
                    )}
                    {submitLabel()}
                </Button>
            )}
        </div>
    )
}

export default CreateAgentSubmitActions