import type { FC, ReactNode } from 'react'
import type { LegalSectionProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { t } from '@openclaw/i18n'

const LegalSection: FC<LegalSectionProps> = ({
    titleKey,
    textKey,
    items,
    children
}): ReactNode => {
    return (
        <section>
            <h2 className='mb-3 text-xl font-semibold'>{t(titleKey)}</h2>
            {textKey && (
                <p
                    className={`text-muted-foreground leading-relaxed${items ? 'mb-3' : ''}`}
                >
                    {t(textKey)}
                </p>
            )}
            {items && items.length > 0 && (
                <ul className='text-muted-foreground mt-2 list-inside list-disc space-y-2'>
                    {items.map((key) => (
                        <Fragment key={key}>
                            <li>{t(key)}</li>
                        </Fragment>
                    ))}
                </ul>
            )}
            {children}
        </section>
    )
}

export default LegalSection