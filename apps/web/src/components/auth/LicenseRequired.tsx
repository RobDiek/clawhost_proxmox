import type { FC, ReactNode } from 'react'

import { t } from '@openclaw/i18n'
import { useNavigate } from 'react-router-dom'
import { LockIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui'
import { ROUTES } from '@/lib'

const LicenseRequired: FC = (): ReactNode => {
    const navigate = useNavigate()

    return (
        <div className='relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center'>
            <div className='from-primary/20 to-primary/5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br'>
                <LockIcon className='text-primary h-9 w-9' />
            </div>
            <div>
                <h3 className='mb-2 text-xl font-semibold'>
                    {t('license.gateTitle')}
                </h3>
                <p className='text-muted-foreground mx-auto max-w-sm'>
                    {t('license.gateDescription')}
                </p>
            </div>
            <Button
                onClick={() => navigate(`${ROUTES.ACCOUNT}#license`)}
                className='h-10 gap-2 border-0 bg-gradient-to-r from-[#ef5350] to-[#c62828] text-sm text-white hover:opacity-90'
            >
                {t('license.purchaseLicense')}
            </Button>
        </div>
    )
}

export default LicenseRequired