import type { FC, ReactNode } from 'react'
import type { SkillsSearchBarProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { MagnifyingGlassIcon } from '@phosphor-icons/react'

const SkillsSearchBar: FC<SkillsSearchBarProps> = ({
    search,
    onSearchChange,
    disabled
}): ReactNode => {
    return (
        <div
            className={`bg-background sticky top-0 z-10 px-5 pb-3 pt-5 ${disabled ? 'pointer-events-none opacity-50' : ''}`}
        >
            <div className='relative'>
                <MagnifyingGlassIcon className='text-muted-foreground absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2' />
                <input
                    type='text'
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder={t('playground.skillsSearch')}
                    className='border-border bg-foreground/5 text-foreground placeholder:text-muted-foreground w-full rounded-md border py-2 pl-8 pr-3 text-xs outline-none transition-colors focus:border-[#ef5350]/50'
                />
            </div>
        </div>
    )
}

export default SkillsSearchBar