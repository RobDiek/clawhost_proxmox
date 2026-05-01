import type { FC, ReactNode } from 'react'
import type { BillingToggleV2Props } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'

const BillingToggleV2: FC<BillingToggleV2Props> = ({
    isYearly,
    onChange
}): ReactNode => {
    return (
        <div className='mt-6 inline-flex items-center gap-1 border border-white/10 bg-white/[0.03] p-1'>
            <button
                onClick={() => onChange(false)}
                className={`px-4 py-1.5 font-mono text-xs tracking-[0.1em] transition ${
                    !isYearly
                        ? 'bg-[#6B5CE7] text-white'
                        : 'text-white/40 hover:text-white/70'
                }`}
            >
                {t('createClaw.monthly').toUpperCase()}
            </button>
            <button
                onClick={() => onChange(true)}
                className={`flex items-center gap-2 px-4 py-1.5 font-mono text-xs tracking-[0.1em] transition ${
                    isYearly
                        ? 'bg-[#6B5CE7] text-white'
                        : 'text-white/40 hover:text-white/70'
                }`}
            >
                {t('createClaw.yearly').toUpperCase()}
                <span
                    className={`px-1.5 py-0.5 text-[10px] ${
                        isYearly
                            ? 'bg-white/20 text-white'
                            : 'bg-white/5 text-white/40'
                    }`}
                >
                    {t('createClaw.yearlySaveBadge')}
                </span>
            </button>
        </div>
    )
}

export default BillingToggleV2