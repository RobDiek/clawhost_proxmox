import type { FC, ReactNode } from 'react'
import type { MacosDesktopPreviewProps } from '@/ts/Interfaces'

import { lazy, Suspense } from 'react'
import { t } from '@openclaw/i18n'
import { motion } from 'framer-motion'
import {
    EnvelopeSimpleIcon,
    GlobeSimpleIcon,
    MusicNoteIcon,
    ImageIcon,
    CalendarIcon,
    FolderIcon,
    NoteIcon,
    TerminalIcon,
    WifiHighIcon,
    BatteryFullIcon,
    MagnifyingGlassIcon
} from '@phosphor-icons/react'

const LazyDemoPreview = lazy(
    () => import('@/components/landing/LandingDemoPreview')
)

const MacosDesktopPreview: FC<MacosDesktopPreviewProps> = ({
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
                className='border-border relative overflow-hidden rounded-2xl border'
            >
                <div
                    className='relative flex flex-col'
                    style={{
                        backgroundImage: 'url(/macos-wallpaper.webp)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                    }}
                >
                    <div className='flex items-center justify-between bg-black/30 px-4 py-1 backdrop-blur-xl'>
                        <div className='flex items-center gap-4'>
                            <span className='text-[11px] font-semibold text-white/90'>
                                {t('common.brandNameGo')}
                            </span>
                            <span className='hidden text-[11px] text-white/60 sm:inline'>
                                {t('common.menuFile')}
                            </span>
                            <span className='hidden text-[11px] text-white/60 sm:inline'>
                                {t('common.menuEdit')}
                            </span>
                            <span className='hidden text-[11px] text-white/60 sm:inline'>
                                {t('common.menuView')}
                            </span>
                            <span className='hidden text-[11px] text-white/60 md:inline'>
                                {t('common.menuWindow')}
                            </span>
                            <span className='hidden text-[11px] text-white/60 md:inline'>
                                {t('common.menuHelp')}
                            </span>
                        </div>
                        <div className='flex items-center gap-3'>
                            <WifiHighIcon
                                className='h-3.5 w-3.5 text-white/70'
                                weight='bold'
                            />
                            <MagnifyingGlassIcon
                                className='h-3.5 w-3.5 text-white/70'
                                weight='bold'
                            />
                            <BatteryFullIcon
                                className='h-3.5 w-3.5 text-white/70'
                                weight='fill'
                            />
                            <span className='text-[11px] text-white/70'>
                                {t('landing.macosPreviewTime')}
                            </span>
                        </div>
                    </div>

                    <div className='flex flex-1 flex-col items-center px-6 pb-16 pt-4 md:px-10 md:pb-20 md:pt-6'>
                        <div className='flex h-[70vh] w-full flex-col overflow-hidden rounded-xl border border-white/20 shadow-2xl'>
                            <div className='flex items-center gap-2 bg-[#2a2a2a]/95 px-4 py-2 backdrop-blur-sm'>
                                <div className='flex items-center gap-1.5'>
                                    <div className='h-3 w-3 rounded-full bg-[#ff5f57]' />
                                    <div className='h-3 w-3 rounded-full bg-[#febc2e]' />
                                    <div className='h-3 w-3 rounded-full bg-[#28c840]' />
                                </div>
                                <span className='flex-1 text-center text-xs text-white/50'>
                                    {t('common.brandNameGo')}
                                </span>
                                <div className='w-[54px]' />
                            </div>
                            <div className='bg-background flex flex-1 flex-col overflow-hidden'>
                                <Suspense
                                    fallback={
                                        <div className='flex flex-1 items-center justify-center'>
                                            <div className='border-border bg-muted/50 h-3 w-3 animate-pulse rounded-full' />
                                        </div>
                                    }
                                >
                                    <LazyDemoPreview
                                        urlOverride={t('common.brandNameGo')}
                                        hideTitleBar
                                    />
                                </Suspense>
                            </div>
                        </div>
                    </div>

                    <div className='absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-2xl border border-white/20 bg-white/10 px-2.5 py-1 backdrop-blur-xl'>
                        <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-400 to-blue-600'>
                            <GlobeSimpleIcon
                                className='h-5 w-5 text-white'
                                weight='fill'
                            />
                        </div>
                        <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600'>
                            <EnvelopeSimpleIcon
                                className='h-5 w-5 text-white'
                                weight='fill'
                            />
                        </div>
                        <div className='hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-400 to-red-600 sm:flex'>
                            <MusicNoteIcon
                                className='h-5 w-5 text-white'
                                weight='fill'
                            />
                        </div>
                        <div className='hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500 sm:flex'>
                            <NoteIcon
                                className='h-5 w-5 text-white'
                                weight='fill'
                            />
                        </div>
                        <div className='hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 md:flex'>
                            <CalendarIcon
                                className='h-5 w-5 text-white'
                                weight='fill'
                            />
                        </div>
                        <div className='hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-400 to-violet-600 md:flex'>
                            <ImageIcon
                                className='h-5 w-5 text-white'
                                weight='fill'
                            />
                        </div>
                        <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1e1e1e]'>
                            <TerminalIcon
                                className='h-5 w-5 text-white'
                                weight='fill'
                            />
                        </div>
                        <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-600'>
                            <FolderIcon
                                className='h-5 w-5 text-white'
                                weight='fill'
                            />
                        </div>
                        <div className='mx-0.5 h-7 w-px shrink-0 bg-white/20' />
                        <img
                            src='/clawnode-logo.webp'
                            alt={t('landing.clawnodeGoLogoAlt')}
                            loading='lazy'
                            className='h-9 w-9 shrink-0 rounded-xl'
                        />
                    </div>
                </div>
            </motion.div>
        </div>
    )
}

export default MacosDesktopPreview