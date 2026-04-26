import type { FC, ReactNode } from 'react'
import type { AgentSelection } from '@/ts/Types'

import { useNavigate } from 'react-router-dom'
import { WarningIcon } from '@phosphor-icons/react'
import { t } from '@openclaw/i18n'
import { usePreferencesStore, useUIStore } from '@/lib/store'
import { AGENT, PRODUCT } from '@/lib/constants'
import { ROUTES } from '@/lib'
import { OpenClawIcon, HermesIcon } from '@/components/icons'
import { usePlans } from '@/hooks'

const AgentSwitcher: FC = (): ReactNode => {
    const agent = usePreferencesStore((s) => s.agent)
    const setAgent = usePreferencesStore((s) => s.setAgent)
    const product = usePreferencesStore((s) => s.product)
    const navigate = useNavigate()

    const {
        plans: hetznerPlans,
        isLoading: hetznerLoading,
        atCapacity: hetznerAtCapacity
    } = usePlans()

    const { phBannerVisible } = useUIStore()

    const hetznerUnavailable =
        !hetznerLoading && (!hetznerPlans?.length || hetznerAtCapacity)

    const showAnnouncement = !phBannerVisible && hetznerUnavailable

    const handleSwitch = (newAgent: AgentSelection) => {
        if (newAgent === agent) return
        setAgent(newAgent)
        if (newAgent === AGENT.HERMES) {
            navigate(product === PRODUCT.GO ? ROUTES.HERMES_GO : ROUTES.HERMES)
        } else {
            navigate(product === PRODUCT.GO ? ROUTES.GO : ROUTES.HOME)
        }
    }

    const agents = [
        {
            key: AGENT.OPENCLAW,
            label: t('nav.openClaw'),
            icon: <OpenClawIcon size={14} />
        },
        {
            key: AGENT.HERMES,
            label: t('nav.hermes'),
            icon: <HermesIcon size={14} />
        }
    ]

    return (
        <div className='border-b border-black/10 bg-black dark:border-white/10 dark:bg-[#0a0a0f]'>
            <div className='mx-auto flex max-w-6xl items-center justify-between px-6 py-1.5'>
                <div className='flex items-center gap-1'>
                    {agents.map((item) => (
                        <button
                            key={item.key}
                            onClick={() => handleSwitch(item.key)}
                            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                                agent === item.key
                                    ? 'bg-white/10 text-white'
                                    : 'text-white/40 hover:text-white/70'
                            }`}
                        >
                            {item.icon}
                            {item.label}
                        </button>
                    ))}
                </div>
                {showAnnouncement && (
                    <div className='hidden items-center gap-2 text-xs md:flex'>
                        <WarningIcon
                            size={14}
                            weight='fill'
                            className='text-amber-500'
                        />
                        <span className='font-semibold text-amber-500'>
                            {t('announcement.title')}
                        </span>
                        <span className='text-white/30'>—</span>
                        <span className='text-white/50'>
                            {t('announcement.message')}
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}

export default AgentSwitcher