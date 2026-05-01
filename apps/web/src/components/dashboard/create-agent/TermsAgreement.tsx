import type { FC, ReactNode } from 'react'
import type { TermsAgreementProps } from '@/ts/Interfaces'

import { Link } from 'react-router-dom'
import { t } from '@openclaw/i18n'
import { ROUTES } from '@/lib'
import { Checkbox } from '@/components/ui'

const TermsAgreement: FC<TermsAgreementProps> = ({
    agreedToTerms,
    onAgreedChange
}): ReactNode => {
    return (
        <label className='flex cursor-pointer items-start gap-2'>
            <Checkbox
                checked={agreedToTerms}
                onCheckedChange={(checked) => onAgreedChange(!!checked)}
                className='mt-0.5'
            />
            <span className='text-muted-foreground text-xs'>
                {t('createClaw.agreementNotice')}{' '}
                <Link
                    to={ROUTES.TERMS}
                    className='text-muted-foreground hover:text-foreground underline'
                    target='_blank'
                >
                    {t('auth.termsOfService')}
                </Link>{' '}
                {t('auth.andWord')}{' '}
                <Link
                    to={ROUTES.PRIVACY}
                    className='text-muted-foreground hover:text-foreground underline'
                    target='_blank'
                >
                    {t('auth.privacyPolicy')}
                </Link>
            </span>
        </label>
    )
}

export default TermsAgreement