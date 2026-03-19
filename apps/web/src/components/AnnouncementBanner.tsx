import type { FC, ReactNode } from 'react'

import { useRef } from 'react'
import { WarningIcon } from '@phosphor-icons/react'
import { t } from '@openclaw/i18n'
import { clawProvider } from '@openclaw/shared'
import { usePlans } from '@/hooks'
import { useUIStore } from '@/lib/store'

const providerLabels: Record<string, string> = {
    [clawProvider.hetzner]: t('createClaw.providerHetzner'),
    [clawProvider.digitalocean]: t('createClaw.providerDigitalOcean'),
    [clawProvider.vultr]: t('createClaw.providerVultr')
}

const AnnouncementBanner: FC = (): ReactNode => {
    const {
        plans: hetznerPlans,
        isLoading: hetznerLoading,
        atCapacity: hetznerAtCapacity
    } = usePlans(clawProvider.hetzner)
    const {
        plans: digitaloceanPlans,
        isLoading: digitaloceanLoading,
        atCapacity: digitaloceanAtCapacity
    } = usePlans(clawProvider.digitalocean)
    const {
        plans: vultrPlans,
        isLoading: vultrLoading,
        atCapacity: vultrAtCapacity
    } = usePlans(clawProvider.vultr)

    const lockedProviders = useRef(new Set<string>())

    const allLoading = hetznerLoading && digitaloceanLoading && vultrLoading

    if (!allLoading) {
        if (!hetznerLoading && (!hetznerPlans?.length || hetznerAtCapacity))
            lockedProviders.current.add(clawProvider.hetzner)
        if (
            !digitaloceanLoading &&
            (!digitaloceanPlans?.length || digitaloceanAtCapacity)
        )
            lockedProviders.current.add(clawProvider.digitalocean)
        if (!vultrLoading && (!vultrPlans?.length || vultrAtCapacity))
            lockedProviders.current.add(clawProvider.vultr)
    }

    const { phBannerVisible } = useUIStore()

    const unavailableProviders = Array.from(lockedProviders.current)
    const visible = !phBannerVisible && unavailableProviders.length > 0
    const providersText = unavailableProviders.map((p) => providerLabels[p]).join(', ')

    if (!visible) return null

    return (
        <div className='animate-banner-enter relative z-50 overflow-hidden'>
            <div className='relative border-b border-amber-500/10 bg-white dark:bg-[#0a0a0f]'>
                <div className='absolute inset-0 bg-gradient-to-r from-amber-500/5 via-transparent to-amber-500/5 dark:from-amber-500/10 dark:to-amber-500/10' />
                <div className='relative px-4 pb-2 pt-3 text-center text-sm leading-6'>
                    <p className='inline'>
                        <span className='mb-[3px] inline-flex items-center gap-2 align-middle'>
                            <WarningIcon
                                size={16}
                                weight='fill'
                                className='text-amber-500'
                            />
                            <span className='font-semibold text-amber-500'>
                                {t('announcement.title')}
                            </span>
                        </span>
                        <span className='text-foreground/30'>
                            {' \u2002—\u2002 '}
                        </span>
                        <span className='text-foreground/60'>
                            {t('announcement.message', {
                                providers: providersText
                            })}
                        </span>
                    </p>
                </div>
            </div>
        </div>
    )
}

export default AnnouncementBanner