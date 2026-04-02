import type { FC, ReactNode } from 'react'
import type { TranslationKey } from '@openclaw/i18n'
import type { CompareTableDesktopProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { t } from '@openclaw/i18n'

const CompareTableDesktop: FC<CompareTableDesktopProps> = ({
    categories,
    competitors,
    colSpan,
    renderValue
}): ReactNode => {
    return (
        <table className='w-full min-w-[700px]'>
            <thead>
                <tr className='border-border border-b'>
                    <th className='text-foreground px-6 py-4 text-left text-sm font-semibold'>
                        {t('compare.feature')}
                    </th>
                    {competitors.map((competitor) => (
                        <th
                            key={competitor.id}
                            className='text-foreground px-6 py-4 text-center text-sm font-semibold'
                        >
                            {t(competitor.nameKey as TranslationKey)}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody className='divide-border divide-y'>
                {categories.map((category) => (
                    <Fragment key={`cat-${category.id}`}>
                        <tr>
                            <td
                                colSpan={colSpan}
                                className='bg-foreground/[0.03] px-6 py-3'
                            >
                                <span className='text-foreground text-sm font-semibold'>
                                    {t(category.nameKey as TranslationKey)}
                                </span>
                            </td>
                        </tr>
                        {category.features.map((feature, featureIndex) => (
                            <tr key={`${category.id}-${featureIndex}`}>
                                <td className='text-foreground px-6 py-4 text-sm'>
                                    {t(feature.nameKey as TranslationKey)}
                                </td>
                                {competitors.map((competitor) => (
                                    <td
                                        key={competitor.id}
                                        className='px-6 py-4'
                                    >
                                        {renderValue(
                                            feature.values[competitor.id]
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </Fragment>
                ))}
            </tbody>
        </table>
    )
}

export default CompareTableDesktop