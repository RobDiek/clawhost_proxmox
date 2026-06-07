import type { FC, ReactNode } from 'react'
import type { PricingSectionProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { Badge } from '@/components/ui'
import { SimplePlanCard, buildSimplePlans } from '@/components/landing'

const PricingSection: FC<PricingSectionProps> = ({ plans }): ReactNode => {
    return (
        <section
            id='pricing'
            className='cv-auto border-border relative scroll-mt-24 border-t px-6 py-24'
        >
            <div className='mx-auto max-w-6xl'>
                <div className='mb-16 text-center'>
                    <Badge
                        variant='outline'
                        className='border-border bg-foreground/5 text-foreground/80 mb-4'
                    >
                        {t('landing.pricing')}
                    </Badge>

                    <h2 className='font-clash from-foreground to-muted-foreground mb-4 bg-gradient-to-b bg-clip-text text-4xl font-bold text-transparent md:text-5xl'>
                        {t('landing.simpleTransparentPricing')}
                    </h2>

                    <p className='text-muted-foreground mx-auto max-w-xl text-lg'>
                        {t('landing.pricingDescription')}
                    </p>
                </div>

                <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
                    {buildSimplePlans(plans).map((sp) => (
                        <SimplePlanCard
                            key={sp.planId}
                            name={sp.name}
                            description={sp.desc}
                            price={sp.price}
                            yearlyPerMonth={sp.yearlyPerMonth}
                            planId={sp.planId}
                            popular={sp.popular}
                            features={sp.features}
                        />
                    ))}
                </div>
            </div>
        </section>
    )
}

export default PricingSection