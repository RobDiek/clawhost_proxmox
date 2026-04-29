import type { FC, ReactNode } from 'react'
import type { ComparisonTableProps } from '@/ts/Interfaces'

import { Link } from 'react-router-dom'
import { t } from '@openclaw/i18n'
import { CheckIcon, XIcon } from '@phosphor-icons/react'
import { ROUTES } from '@/lib'
import ScrollRevealV2 from '@/components/v2/ScrollRevealV2'
import SectionLabelV2 from '@/components/v2/SectionLabelV2'
import LogoV2 from '@/components/v2/LogoV2'

const ComparisonTableV2: FC<ComparisonTableProps> = ({
    badge,
    heading,
    description,
    rows,
    showFullComparisonLink = true,
    logoSuffix
}): ReactNode => {
    return (
        <section
            id='comparison'
            className='v2-section scroll-mt-24 border-t border-white/[0.025] px-6 py-24'
        >
            <div className='mx-auto max-w-6xl'>
                <ScrollRevealV2 className='mb-16'>
                    <SectionLabelV2 label={badge} />
                    <h2 className='font-syne mb-4 text-4xl font-extrabold uppercase tracking-tight text-white md:text-5xl'>
                        {heading}
                    </h2>
                    <p className='max-w-xl font-mono text-sm leading-relaxed text-white/40'>
                        {description}
                    </p>
                </ScrollRevealV2>

                <ScrollRevealV2 delay={0.2} className='relative z-[15] overflow-x-auto border border-white/10'>
                    <table className='w-full bg-[#020204]'>
                        <thead>
                            <tr className='bg-[#0a0a0c]'>
                                <th className='px-6 py-4'>
                                    <div className='flex items-center justify-center gap-2 scale-90 origin-center'>
                                        <LogoV2 />
                                        {logoSuffix && (
                                            <span className='font-syne translate-y-px text-sm font-bold text-white'>
                                                {logoSuffix}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th className='px-6 py-4 text-center'>
                                    <span className='font-mono text-xs uppercase tracking-[0.15em] text-white/30'>
                                        {t('landing.others')}
                                    </span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, index) => (
                                <tr
                                    key={index}
                                    className={`border-t border-white/5 ${
                                        index % 2 !== 0 ? 'bg-[#050507]' : 'bg-[#020204]'
                                    } ${
                                        index === 0
                                            ? 'font-syne font-semibold'
                                            : ''
                                    }`}
                                >
                                    <td className='px-6 py-4'>
                                        <div className='flex items-center gap-3'>
                                            <CheckIcon
                                                size={16}
                                                className='flex-shrink-0 text-[#6B5CE7]'
                                            />
                                            <span className='text-sm text-white/80'>
                                                {row.us}
                                            </span>
                                        </div>
                                    </td>
                                    <td className='px-6 py-4'>
                                        <div className='flex items-center gap-3'>
                                            <XIcon
                                                size={16}
                                                className='flex-shrink-0 text-white/15'
                                            />
                                            <span className='text-sm text-white/50'>
                                                {row.others}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </ScrollRevealV2>

                {showFullComparisonLink && (
                    <div className='mt-6 text-center'>
                        <Link
                            to={ROUTES.COMPARE}
                            className='font-mono text-xs text-[#6B5CE7] transition hover:text-[#6B5CE7]/80'
                        >
                            {t('landing.seeFullComparison')}
                        </Link>
                    </div>
                )}
            </div>
        </section>
    )
}

export default ComparisonTableV2