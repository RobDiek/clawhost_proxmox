import type { FC, ReactNode } from 'react'
import type { LanguageOption } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { usePreferencesStore } from '@/lib/store'
import LANGUAGES from '@/lib/constants/languages'
import { GlobeSimpleIcon, CheckIcon } from '@phosphor-icons/react'
import {
    Button,
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    Tooltip,
    TooltipTrigger,
    TooltipContent
} from '@/components/ui'

const LANGUAGE_OPTIONS: LanguageOption[] = [
    { value: LANGUAGES.EN, label: 'English', flag: '🇺🇸' },
    { value: LANGUAGES.FR, label: 'Français', flag: '🇫🇷' },
    { value: LANGUAGES.ES, label: 'Español', flag: '🇪🇸' },
    { value: LANGUAGES.DE, label: 'Deutsch', flag: '🇩🇪' },
    { value: LANGUAGES.ZH, label: '中文', flag: '🇨🇳' },
    { value: LANGUAGES.HI, label: 'हिन्दी', flag: '🇮🇳' },
    { value: LANGUAGES.AR, label: 'العربية', flag: '🇸🇦' },
    { value: LANGUAGES.RU, label: 'Русский', flag: '🇷🇺' },
    { value: LANGUAGES.JA, label: '日本語', flag: '🇯🇵' },
    { value: LANGUAGES.TR, label: 'Türkçe', flag: '🇹🇷' },
    { value: LANGUAGES.IT, label: 'Italiano', flag: '🇮🇹' },
    { value: LANGUAGES.PL, label: 'Polski', flag: '🇵🇱' },
    { value: LANGUAGES.NL, label: 'Nederlands', flag: '🇳🇱' },
    { value: LANGUAGES.PT, label: 'Português', flag: '🇧🇷' }
]

const LanguageSelector: FC = (): ReactNode => {
    const language = usePreferencesStore((s) => s.language)
    const setLanguage = usePreferencesStore((s) => s.setLanguage)

    return (
        <DropdownMenu modal={false}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant='ghost'
                            size='icon'
                            className='text-muted-foreground hover:text-foreground h-8 w-8'
                            aria-label={t('language.switchLanguage')}
                        >
                            <GlobeSimpleIcon className='h-4 w-4' />
                        </Button>
                    </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side='bottom'>
                    <p>{t('language.switchLanguage')}</p>
                </TooltipContent>
            </Tooltip>
            <DropdownMenuContent
                align='end'
                className='max-h-80 w-44 overflow-y-auto'
            >
                {LANGUAGE_OPTIONS.map((lang) => (
                    <DropdownMenuItem
                        key={lang.value}
                        onClick={() => setLanguage(lang.value)}
                        className='flex items-center justify-between'
                    >
                        <span className='flex items-center gap-2'>
                            <span>{lang.flag}</span>
                            <span>{lang.label}</span>
                        </span>
                        {language === lang.value && (
                            <CheckIcon className='h-4 w-4' weight='bold' />
                        )}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

export default LanguageSelector