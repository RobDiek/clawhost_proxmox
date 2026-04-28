import type { FC, ReactNode } from 'react'
import type { SectionLabelV2Props } from '@/ts/Interfaces'

const SectionLabelV2: FC<SectionLabelV2Props> = ({ label }): ReactNode => {
    return (
        <span className='mb-4 inline-block font-mono text-[10px] tracking-[0.3em] text-white/40'>
            // {label.toUpperCase().replace(/\s+/g, '_')}
        </span>
    )
}

export default SectionLabelV2