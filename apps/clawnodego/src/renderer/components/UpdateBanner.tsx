import type { FC, ReactNode } from 'react'

import { useState, useEffect } from 'react'
import { t } from '@openclaw/i18n'
import { ArrowClockwiseIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui'

const UpdateBanner: FC = (): ReactNode => {
    const [latestVersion, setLatestVersion] = useState<string | null>(null)
    const [dismissed, setDismissed] = useState(false)

    useEffect(() => {
        window.electronAPI.checkAppUpdate().then((info) => {
            if (info.hasUpdate && info.latestVersion) {
                setLatestVersion(info.latestVersion)
            }
        })
        const off = window.electronAPI.onUpdateDownloaded((info) => {
            if (info.hasUpdate && info.latestVersion) {
                setLatestVersion(info.latestVersion)
                setDismissed(false)
            }
        })
        return off
    }, [])

    if (!latestVersion || dismissed) return null

    return (
        <div className='border-border bg-primary/5 flex items-center justify-between border-b px-4 py-2'>
            <span className='text-sm'>
                {t('go.updateAvailable', { version: latestVersion })}
            </span>
            <div className='flex items-center gap-2'>
                <Button
                    variant='ghost'
                    size='sm'
                    className='h-7 text-xs'
                    onClick={() => setDismissed(true)}
                >
                    {t('go.updateDismiss')}
                </Button>
                <Button
                    size='sm'
                    className='h-7 gap-1.5 text-xs'
                    onClick={() => window.electronAPI.quitAndInstall()}
                >
                    <ArrowClockwiseIcon className='h-3.5 w-3.5' />
                    {t('go.updateDownload')}
                </Button>
            </div>
        </div>
    )
}

export default UpdateBanner