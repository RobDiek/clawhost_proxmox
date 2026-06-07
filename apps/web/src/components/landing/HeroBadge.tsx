import type { FC, ReactNode } from 'react'
import type { HeroBadgeProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { SparkleIcon, PlayCircleIcon } from '@phosphor-icons/react'

const HeroBadge: FC<HeroBadgeProps> = ({
    label,
    tutorialBadge,
    onTutorialClick
}): ReactNode => {
    return (
        <div className='mb-8 flex flex-wrap items-center justify-center gap-3'>
            <div className='glow-border border-border bg-foreground/5 inline-flex items-center gap-2 rounded-full border px-4 py-2'>
                <SparkleIcon className='h-4 w-4 text-[#0072C6]' weight='fill' />
                <span className='text-foreground/80 text-sm'>{label}</span>
            </div>
            {tutorialBadge && onTutorialClick && (
                <button
                    onClick={onTutorialClick}
                    className='glow-border border-border bg-foreground/5 hover:bg-foreground/10 hidden cursor-pointer items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-4 transition-colors'
                >
                    <div className='relative h-7 w-10 flex-shrink-0 overflow-hidden rounded-full'>
                        <img
                            src='https://img.youtube.com/vi/clawnode-tutorial/mqdefault.jpg'
                            alt={t('landing.tutorialVideoThumbnail')}
                            className='h-full w-full object-cover'
                            width={320}
                            height={180}
                            loading='lazy'
                        />
                        <div className='absolute inset-0 flex items-center justify-center bg-black/30'>
                            <PlayCircleIcon className='h-3.5 w-3.5 text-white' />
                        </div>
                    </div>
                    <span className='text-foreground/80 text-sm'>
                        {t('landing.tutorialBadge')}
                    </span>
                </button>
            )}
        </div>
    )
}

export default HeroBadge