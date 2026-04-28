import type { FC, ReactNode } from 'react'
import type { FaqSectionProps } from '@/ts/Interfaces'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CaretDownIcon } from '@phosphor-icons/react'
import ScrollRevealV2 from '@/components/v2/ScrollRevealV2'
import SectionLabelV2 from '@/components/v2/SectionLabelV2'

const FaqSectionV2: FC<FaqSectionProps> = ({
    badge,
    heading,
    description,
    faqs
}): ReactNode => {
    const [openIndex, setOpenIndex] = useState<number | null>(null)

    return (
        <section
            id='faq'
            className='v2-section scroll-mt-24 border-t border-white/10 px-6 py-24'
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

                <ScrollRevealV2 delay={0.2} className='relative z-[15] divide-y divide-white/10 border border-white/10'>
                    {faqs.map((faq, i) => (
                        <div
                            key={i}
                            className='bg-[#070709]'
                        >
                            <button
                                onClick={() =>
                                    setOpenIndex(openIndex === i ? null : i)
                                }
                                className='flex w-full items-center justify-between p-6 text-left transition-colors hover:bg-white/[0.05]'
                            >
                                <span className='font-mono text-sm text-white/80'>
                                    {faq.question}
                                </span>
                                <CaretDownIcon
                                    className={`h-4 w-4 flex-shrink-0 text-white/30 transition-transform duration-200 ${
                                        openIndex === i ? 'rotate-180' : ''
                                    }`}
                                />
                            </button>
                            <AnimatePresence>
                                {openIndex === i && (
                                    <motion.div
                                        initial={{
                                            height: 0,
                                            opacity: 0
                                        }}
                                        animate={{
                                            height: 'auto',
                                            opacity: 1
                                        }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className='overflow-hidden'
                                    >
                                        <div className='p-6'>
                                            <p className='text-sm leading-relaxed text-white/40'>
                                                {faq.answer}
                                            </p>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ))}
                </ScrollRevealV2>
            </div>
        </section>
    )
}

export default FaqSectionV2