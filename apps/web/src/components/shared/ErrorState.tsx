import type { FC, ReactNode } from 'react'
import type { ErrorStateProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { Button } from '@/components/ui'
import { WarningCircleIcon, ArrowClockwiseIcon } from '@phosphor-icons/react'

const ErrorState: FC<ErrorStateProps> = ({
    title,
    description,
    onRetry
}): ReactNode => {
    return (
        <div className='py-12 text-center'>
            <div className='bg-destructive/10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full'>
                <WarningCircleIcon className='text-destructive h-8 w-8' />
            </div>
            <h3 className='mb-2 text-lg font-semibold'>
                {title || t('errors.somethingWentWrong')}
            </h3>
            <p className='text-muted-foreground mx-auto mb-6 max-w-sm'>
                {description || t('errors.couldNotLoadData')}
            </p>
            {onRetry && (
                <Button variant='outline' onClick={onRetry}>
                    <ArrowClockwiseIcon className='h-4 w-4' />
                    {t('common.tryAgain')}
                </Button>
            )}
        </div>
    )
}

export default ErrorState