import type { FC, ReactNode } from 'react'
import type { ScrollRevealV2Props } from '@/ts/Interfaces'

import { motion } from 'framer-motion'

const ScrollRevealV2: FC<ScrollRevealV2Props> = ({
    children,
    delay = 0,
    className
}): ReactNode => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, delay }}
            className={className}
        >
            {children}
        </motion.div>
    )
}

export default ScrollRevealV2