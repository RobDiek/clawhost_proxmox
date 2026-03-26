import type { FC, ReactNode } from 'react'

import { t } from '@openclaw/i18n'

const PlansSkeleton: FC = (): ReactNode => {
    return (
        <div className='overflow-x-auto'>
            <table className='w-full border-collapse'>
                <thead>
                    <tr className='border-border border-b'>
                        <th className='font-clash text-foreground px-4 py-4 text-left font-semibold'>
                            {t('landing.planColumn')}
                        </th>
                        <th className='font-clash text-foreground px-4 py-4 text-center font-semibold'>
                            {t('landing.vCpuColumn')}
                        </th>
                        <th className='font-clash text-foreground px-4 py-4 text-center font-semibold'>
                            {t('landing.ramColumn')}
                        </th>
                        <th className='font-clash text-foreground px-4 py-4 text-center font-semibold'>
                            {t('landing.storageColumn')}
                        </th>
                        <th className='font-clash text-foreground px-4 py-4 text-center font-semibold'>
                            {t('landing.monthlyColumn')}
                        </th>
                        <th className='px-4 py-4 text-right'></th>
                    </tr>
                </thead>
                <tbody>
                    {Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i} className='border-border border-b'>
                            <td className='px-4 py-4'>
                                <div className='bg-foreground/10 h-5 w-24 animate-pulse rounded' />
                            </td>
                            <td className='px-4 py-4'>
                                <div className='bg-foreground/10 mx-auto h-5 w-8 animate-pulse rounded' />
                            </td>
                            <td className='px-4 py-4'>
                                <div className='bg-foreground/10 mx-auto h-5 w-14 animate-pulse rounded' />
                            </td>
                            <td className='px-4 py-4'>
                                <div className='bg-foreground/10 mx-auto h-5 w-14 animate-pulse rounded' />
                            </td>
                            <td className='px-4 py-4'>
                                <div className='bg-foreground/10 mx-auto h-5 w-16 animate-pulse rounded' />
                            </td>
                            <td className='px-4 py-4 text-right'>
                                <div className='bg-foreground/10 ml-auto h-8 w-20 animate-pulse rounded' />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

export default PlansSkeleton