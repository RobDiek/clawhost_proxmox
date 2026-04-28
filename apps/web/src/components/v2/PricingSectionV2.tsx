import type { FC, ReactNode } from 'react'
import type { PricingSectionProps } from '@/ts/Interfaces'

import { Link } from 'react-router-dom'
import { t } from '@openclaw/i18n'
import { useAuth } from '@/lib/auth'
import { ROUTES } from '@/lib'
import { CheckIcon, XIcon } from '@phosphor-icons/react'
import buildV2Plans from '@/components/v2/buildV2Plans'
import ScrollRevealV2 from '@/components/v2/ScrollRevealV2'
import SectionLabelV2 from '@/components/v2/SectionLabelV2'

const PricingSectionV2: FC<PricingSectionProps> = ({
    plans,
    plansLoading,
    allDoneLoading
}): ReactNode => {
    const { user } = useAuth()

    return (
        <section
            id='pricing'
            className='v2-section scroll-mt-24 px-6 py-24'
        >
            <div className='mx-auto max-w-6xl'>
                <ScrollRevealV2 className='mb-16'>
                    <SectionLabelV2 label='Pricing' />
                    <h2 className='font-syne mb-4 text-4xl font-extrabold uppercase tracking-tight text-white md:text-5xl'>
                        {t('v2.pricingTitle')}
                    </h2>
                    <p className='max-w-xl font-mono text-sm leading-relaxed text-white/40'>
                        {t('landing.pricingDescription')}
                    </p>
                </ScrollRevealV2>

                {plansLoading || (!allDoneLoading && !plans?.length) ? (
                    <div className='py-12 text-center font-mono text-sm text-white/30'>
                        {t('common.loading')}
                    </div>
                ) : plans && plans.length > 0 ? (
                    <ScrollRevealV2 delay={0.2} className='relative z-[15] grid grid-cols-1 gap-px border border-white/10 sm:grid-cols-2 lg:grid-cols-4'>
                        {buildV2Plans(plans).map((sp) => (
                            <div
                                key={sp.planId}
                                className={`flex flex-col justify-between border-white/10 bg-[#070709] p-6 [&:not(:last-child)]:border-r ${
                                    sp.popular ? 'bg-[#0d0b1a]' : ''
                                }`}
                            >
                                <div>
                                    <div className='mb-1 flex items-center gap-2'>
                                        <span className='font-syne text-lg font-extrabold text-white'>
                                            {sp.name}
                                        </span>
                                        {sp.popular && (
                                            <span className='bg-[#6B5CE7] px-2 py-0.5 font-mono text-[10px] tracking-wider text-white'>
                                                {t('landing.recommended')}
                                            </span>
                                        )}
                                    </div>
                                    <p className='mb-4 font-mono text-[10px] leading-relaxed text-white/30'>
                                        {sp.desc}
                                    </p>
                                    <div className='mb-5 flex items-baseline gap-1'>
                                        <span className='font-syne text-3xl font-extrabold text-white'>
                                            ${sp.price}
                                        </span>
                                        <span className='font-mono text-sm text-white/30'>
                                            /mo
                                        </span>
                                    </div>

                                    <ul className='mb-6 space-y-2'>
                                        {sp.features.map((feature) => (
                                            <li
                                                key={feature.label}
                                                className='flex items-center gap-2 font-mono text-xs text-white/50'
                                            >
                                                {feature.included ? (
                                                    <CheckIcon
                                                        size={12}
                                                        className='flex-shrink-0 text-[#6B5CE7]'
                                                    />
                                                ) : (
                                                    <XIcon
                                                        size={12}
                                                        className='flex-shrink-0 text-white/15'
                                                    />
                                                )}
                                                <span>{feature.label}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <Link
                                    to={
                                        user
                                            ? `${ROUTES.AGENTS}?plan=${sp.planId}`
                                            : `${ROUTES.LOGIN}?plan=${sp.planId}`
                                    }
                                    className={`block w-full py-2.5 text-center font-mono text-[10px] tracking-[0.15em] transition-opacity ${
                                        sp.popular
                                            ? 'bg-[#6B5CE7] text-white hover:opacity-80'
                                            : 'border border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                                    }`}
                                >
                                    {user
                                        ? t('landing.deploy').toUpperCase()
                                        : t('landing.select').toUpperCase()}
                                </Link>
                            </div>
                        ))}
                    </ScrollRevealV2>
                ) : (
                    <div className='py-12 text-center font-mono text-sm text-white/30'>
                        {t('errors.unableToLoadPricing')}
                    </div>
                )}

            </div>
        </section>
    )
}

export default PricingSectionV2