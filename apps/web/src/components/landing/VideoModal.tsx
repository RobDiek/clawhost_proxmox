import type { FC, ReactNode } from 'react'
import type { VideoModalProps } from '@/ts/Interfaces'

import { AnimatePresence, motion } from 'framer-motion'
import { XIcon } from '@phosphor-icons/react'

const VideoModal: FC<VideoModalProps> = ({
    open,
    onClose,
    videoUrl
}): ReactNode => {
    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className='fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm'
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className='relative w-full max-w-4xl px-6'
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={onClose}
                            className='absolute -top-10 right-6 cursor-pointer text-white/60 transition-colors hover:text-white'
                        >
                            <XIcon className='h-6 w-6' />
                        </button>
                        <div className='aspect-video w-full overflow-hidden rounded-xl'>
                            <iframe
                                src={
                                    videoUrl.replace('watch?v=', 'embed/') +
                                    '?autoplay=1&rel=0'
                                }
                                className='h-full w-full'
                                allow='autoplay; encrypted-media'
                                allowFullScreen
                            />
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}

export default VideoModal