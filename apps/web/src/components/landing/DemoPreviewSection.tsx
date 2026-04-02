import type { FC, ReactNode } from 'react'
import type { DemoPreviewSectionProps } from '@/ts/Interfaces'

import { lazy, Suspense } from 'react'
import { motion } from 'framer-motion'

const LazyDemoPreview = lazy(
    () => import('@/components/landing/LandingDemoPreview')
)

const DemoPreviewSection: FC<DemoPreviewSectionProps> = ({
    previewRef,
    previewScale
}): ReactNode => {
    return (
        <div ref={previewRef} className='mx-auto mb-32 max-w-6xl px-6'>
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                style={{ scale: previewScale }}
                className='border-border bg-background flex h-[80vh] flex-col overflow-hidden rounded-2xl border'
            >
                <Suspense
                    fallback={
                        <div className='flex flex-1 items-center justify-center'>
                            <div className='border-border bg-muted/50 h-3 w-3 animate-pulse rounded-full' />
                        </div>
                    }
                >
                    <LazyDemoPreview />
                </Suspense>
            </motion.div>
        </div>
    )
}

export default DemoPreviewSection