import type { FC, ReactNode } from 'react'

import { useState, useEffect, useCallback } from 'react'
import { t } from '@openclaw/i18n'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui'

const CHECK_INTERVAL = 60 * 60 * 1000

const UpdateBanner: FC = (): ReactNode => {
    const [latestVersion, setLatestVersion] = useState<string | null>(null)
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
    const [dismissed, setDismissed] = useState(false)

    const checkUpdate = useCallback(async () => {
        try {
            const info = await window.electronAPI.checkAppUpdate()
            if (info.hasUpdate && info.latestVersion && info.downloadUrl) {
                setLatestVersion(info.latestVersion)
                setDownloadUrl(info.downloadUrl)
            }
        } catch {}
    }, [])

    useEffect(() => {
        checkUpdate()
        const interval = setInterval(checkUpdate, CHECK_INTERVAL)
        return () => clearInterval(interval)
    }, [checkUpdate])

    if (!latestVersion || !downloadUrl || dismissed) return null

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
                    onClick={() => window.electronAPI.openExternal(downloadUrl)}
                >
                    <ArrowSquareOutIcon className='h-3.5 w-3.5' />
                    {t('go.updateDownload')}
                </Button>
            </div>
        </div>
    )
}

export default UpdateBanner