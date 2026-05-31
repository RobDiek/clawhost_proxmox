import type { FC, ReactNode } from 'react'
import type { AboutAppSectionProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'

const PLATFORM_LABELS: Record<string, string> = {
    darwin: 'macOS',
    win32: 'Windows',
    linux: 'Linux'
}

const AboutAppSection: FC<AboutAppSectionProps> = ({
    version,
    deviceInfo
}): ReactNode => {
    const platformLabel = deviceInfo
        ? (PLATFORM_LABELS[deviceInfo.platform] ?? deviceInfo.platform)
        : null

    return (
        <div className='border-border bg-foreground/5 mt-6 rounded-xl border p-8 backdrop-blur-sm'>
            <div className='mb-6'>
                <h2 className='text-lg font-medium'>{t('account.aboutApp')}</h2>
                <p className='text-muted-foreground mt-1 text-sm'>
                    {t('account.aboutAppDescription')}
                </p>
            </div>

            <div className='divide-border divide-y'>
                <div className='flex items-center justify-between py-3 first:pt-0 last:pb-0'>
                    <span className='text-foreground text-sm'>
                        {t('account.appVersion')}
                    </span>
                    <span className='text-muted-foreground text-sm tabular-nums'>
                        {version}
                    </span>
                </div>
                {platformLabel && (
                    <div className='flex items-center justify-between py-3 first:pt-0 last:pb-0'>
                        <span className='text-foreground text-sm'>
                            {t('account.operatingSystem')}
                        </span>
                        <span className='text-muted-foreground text-sm'>
                            {platformLabel}
                        </span>
                    </div>
                )}
                {deviceInfo && (
                    <div className='flex items-center justify-between py-3 first:pt-0 last:pb-0'>
                        <span className='text-foreground text-sm'>
                            {t('account.architecture')}
                        </span>
                        <span className='text-muted-foreground text-sm'>
                            {deviceInfo.arch}
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}

export default AboutAppSection