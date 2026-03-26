import type { FC, ReactNode } from 'react'

import { t } from '@openclaw/i18n'
import { usePreferencesStore } from '@/lib/store'
import { THEMES } from '@/lib'
import { SunIcon, MoonIcon, DesktopIcon } from '@phosphor-icons/react'
import {
    Button,
    Tooltip,
    TooltipTrigger,
    TooltipContent
} from '@/components/ui'

const ThemeToggle: FC = (): ReactNode => {
    const theme = usePreferencesStore((s) => s.theme)
    const setTheme = usePreferencesStore((s) => s.setTheme)

    const cycle = () => {
        if (theme === THEMES.DARK) setTheme(THEMES.LIGHT)
        else if (theme === THEMES.LIGHT) setTheme(THEMES.SYSTEM)
        else setTheme(THEMES.DARK)
    }

    const label =
        theme === THEMES.DARK
            ? t('theme.dark')
            : theme === THEMES.LIGHT
              ? t('theme.light')
              : t('theme.system')

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant='ghost'
                    size='icon'
                    onClick={cycle}
                    className='text-muted-foreground hover:text-foreground h-8 w-8'
                    aria-label={t('theme.toggleTheme')}
                >
                    {theme === THEMES.DARK ? (
                        <MoonIcon className='h-4 w-4' />
                    ) : theme === THEMES.LIGHT ? (
                        <SunIcon className='h-4 w-4' />
                    ) : (
                        <DesktopIcon className='h-4 w-4' />
                    )}
                </Button>
            </TooltipTrigger>
            <TooltipContent side='bottom'>
                <p>{label}</p>
            </TooltipContent>
        </Tooltip>
    )
}

export default ThemeToggle