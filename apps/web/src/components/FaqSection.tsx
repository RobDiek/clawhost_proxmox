import type { FC, ReactNode } from 'react'
import type { FaqSectionProps } from '@/ts/Interfaces'

import { useState } from 'react'
import { CaretDownIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'framer-motion'
import { Badge } from '@/components/ui'

const FaqSection: FC<FaqSectionProps> = ({
    badge,
    heading,
    description,
    faqs
}): ReactNode => {
    const [openFaq, setOpenFaq] = useState<number | null>(null)

    return (
        <section
            id='faq'
            className='cv-auto border-border relative scroll-mt-24 border-t px-6 py-24'
        >
            <div className='mx-auto max-w-3xl'>
                <div className='mb-16 text-center'>
                    <Badge
                        variant='outline'
                        className='border-border bg-foreground/5 text-foreground/80 mb-4'
                    >
                        {badge}
                    </Badge>
                    <h2 className='font-clash from-foreground to-muted-foreground mb-4 bg-gradient-to-b bg-clip-text text-4xl font-bold text-transparent md:text-5xl'>
                        {heading}
                    </h2>
                    <p className='text-muted-foreground mx-auto max-w-xl text-lg'>
                        {description}
                    </p>
                </div>

                <div className='space-y-3'>
                    {faqs.map((faq, i) => (
                        <div
                            key={i}
                            className='border-border bg-foreground/[0.02] overflow-hidden rounded-xl border'
                        >
                            <button
                                onClick={() =>
                                    setOpenFaq(openFaq === i ? null : i)
                                }
                                className='hover:bg-foreground/[0.02] flex w-full items-center justify-between p-5 text-left transition-colors'
                            >
                                <span className='text-foreground pr-4 font-medium'>
                                    {faq.question}
                                </span>
                                <CaretDownIcon
                                    className={`text-muted-foreground h-5 w-5 flex-shrink-0 transition-transform duration-200 ${
                                        openFaq === i ? 'rotate-180' : ''
                                    }`}
                                />
                            </button>
                            <AnimatePresence>
                                {openFaq === i && (
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
                                        <div className='px-5 pb-5'>
                                            <p className='text-muted-foreground leading-relaxed'>
                                                {faq.answer}
                                            </p>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}

export default FaqSection