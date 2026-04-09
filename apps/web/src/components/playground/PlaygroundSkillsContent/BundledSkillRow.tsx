import type { FC, ReactNode } from 'react'
import type { BundledSkillRowProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { t } from '@openclaw/i18n'
import {
    CircleNotchIcon,
    CubeIcon,
    DownloadSimpleIcon,
    TrashIcon
} from '@phosphor-icons/react'
import { TruncateTooltip } from '@/components/shared'

const BundledSkillRow: FC<BundledSkillRowProps> = ({
    skill,
    active,
    isPending,
    pendingSkill,
    onAction
}): ReactNode => {
    return (
        <div className='border-border bg-foreground/[0.02] flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors'>
            <div className='min-w-0 flex-1'>
                <div className='flex items-center gap-2'>
                    <CubeIcon
                        className='text-muted-foreground h-3 w-3 shrink-0'
                        weight='duotone'
                    />
                    <TruncateTooltip content={skill.name}>
                        <span className='text-foreground block truncate text-xs font-medium'>
                            {skill.name}
                        </span>
                    </TruncateTooltip>
                </div>
                {skill.description && (
                    <TruncateTooltip content={skill.description}>
                        <span className='text-muted-foreground mt-0.5 block truncate text-[11px]'>
                            {skill.description}
                        </span>
                    </TruncateTooltip>
                )}
            </div>
            <button
                onClick={() => onAction(skill.name)}
                disabled={!!pendingSkill}
                className='bg-foreground/5 text-foreground/80 hover:bg-foreground/10 ml-3 flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'
            >
                {isPending ? (
                    <CircleNotchIcon className='h-3 w-3 animate-spin' />
                ) : active ? (
                    <Fragment>
                        <TrashIcon className='h-3 w-3' />
                        {t('playground.clawHubRemove')}
                    </Fragment>
                ) : (
                    <Fragment>
                        <DownloadSimpleIcon className='h-3 w-3' />
                        {t('playground.clawHubInstall')}
                    </Fragment>
                )}
            </button>
        </div>
    )
}

export default BundledSkillRow