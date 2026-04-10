import type { FC, ReactNode } from 'react'
import type { LegalContactSectionProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { SUPPORT_EMAIL } from '@/lib/links'

const LegalContactSection: FC<LegalContactSectionProps> = ({
    titleKey,
    textKey
}): ReactNode => {
    return (
        <section>
            <h2 className='mb-3 text-xl font-semibold'>{t(titleKey)}</h2>
            <p className='text-muted-foreground leading-relaxed'>
                {t(textKey)}{' '}
                <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className='text-primary hover:underline'
                >
                    {t('common.supportEmail')}
                </a>
            </p>
        </section>
    )
}

export default LegalContactSection