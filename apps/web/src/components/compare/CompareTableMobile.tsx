import type { FC, ReactNode } from 'react'
import type { TranslationKey } from '@openclaw/i18n'
import type { CompareTableMobileProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { t } from '@openclaw/i18n'

const CompareTableMobile: FC<CompareTableMobileProps> = ({
    categories,
    clawhost,
    selectedCompetitorId,
    selectedCompetitorNameKey,
    renderValue
}): ReactNode => {
    return (
        <table className='w-full'>
            <thead>
                <tr className='border-border border-b'>
                    <th className='text-foreground px-4 py-3 text-left text-sm font-semibold'>
                        {t('compare.feature')}
                    </th>
                    <th className='text-foreground px-4 py-3 text-center text-sm font-semibold'>
                        {t(clawhost.nameKey as TranslationKey)}
                    </th>
                    <th className='text-foreground px-4 py-3 text-center text-sm font-semibold'>
                        {t(selectedCompetitorNameKey as TranslationKey)}
                    </th>
                </tr>
            </thead>
            <tbody className='divide-border divide-y'>
                {categories.map((category) => (
                    <Fragment key={`m-cat-${category.id}`}>
                        <tr>
                            <td
                                colSpan={3}
                                className='bg-foreground/[0.03] px-4 py-3'
                            >
                                <span className='text-foreground text-sm font-semibold'>
                                    {t(category.nameKey as TranslationKey)}
                                </span>
                            </td>
                        </tr>
                        {category.features.map((feature, featureIndex) => (
                            <tr key={`m-${category.id}-${featureIndex}`}>
                                <td className='text-foreground px-4 py-3 text-sm'>
                                    {t(feature.nameKey as TranslationKey)}
                                </td>
                                <td className='px-4 py-3'>
                                    {renderValue(feature.values[clawhost.id])}
                                </td>
                                <td className='px-4 py-3'>
                                    {renderValue(
                                        feature.values[selectedCompetitorId]
                                    )}
                                </td>
                            </tr>
                        ))}
                    </Fragment>
                ))}
            </tbody>
        </table>
    )
}

export default CompareTableMobile