import type { FC, ReactNode } from 'react'
import type { ClawPreviewContentProps } from '@/ts/Interfaces'
import type { PreviewStatus } from '@/ts/Types'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { t } from '@openclaw/i18n'
import {
    CircleNotchIcon,
    BrowserIcon,
    ArrowClockwiseIcon,
    WarningIcon
} from '@phosphor-icons/react'
import { Button } from '@/components/ui'
import { api, getBaseDomain, PREVIEW_STATUS } from '@/lib'
import { generateSlug } from '@/lib/claw-utils'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { PanelPlaceholder } from '@/components/shared'

const ClawPreviewContent: FC<ClawPreviewContentProps> = ({
    claw,
    readOnly
}): ReactNode => {
    const [status, setStatus] = useState<PreviewStatus>(
        readOnly ? PREVIEW_STATUS.READY : PREVIEW_STATUS.CHECKING
    )
    const [enabling, setEnabling] = useState(false)
    const { showToast } = useUIStore()
    const iframeRef = useRef<HTMLIFrameElement | null>(null)

    const url = useMemo(() => {
        const subdomain = claw.subdomain || generateSlug(claw.id)
        const domain = `${subdomain}.${getBaseDomain()}`
        const token = claw.gatewayToken ? `/?token=${claw.gatewayToken}` : ''
        return `https://${domain}${token}`
    }, [claw.id, claw.subdomain, claw.gatewayToken])

    useEffect(() => {
        if (readOnly) return
        api.checkPreview(claw.id)
            .then((res) => setStatus(res.enabled ? PREVIEW_STATUS.READY : PREVIEW_STATUS.NOT_ENABLED))
            .catch(() => setStatus(PREVIEW_STATUS.NOT_ENABLED))
    }, [claw.id, readOnly])

    const handleEnable = useCallback(async () => {
        setEnabling(true)
        try {
            await api.enablePreview(claw.id)
            showToast(t('clawDetail.previewEnabled'), TOAST_TYPE.SUCCESS)
            setStatus(PREVIEW_STATUS.READY)
        } catch {
            showToast(t('clawDetail.previewEnableFailed'), TOAST_TYPE.ERROR)
        }
        setEnabling(false)
    }, [claw.id, showToast])

    const handleRetry = useCallback(() => {
        setStatus(PREVIEW_STATUS.READY)
        if (iframeRef.current) iframeRef.current.src = url
    }, [url])

    if (status === PREVIEW_STATUS.CHECKING) {
        return (
            <div className='flex h-full items-center justify-center'>
                <CircleNotchIcon className='text-muted-foreground h-6 w-6 animate-spin' />
            </div>
        )
    }

    if (status === PREVIEW_STATUS.NOT_ENABLED) {
        return (
            <PanelPlaceholder
                icon={
                    <BrowserIcon
                        className='text-muted-foreground h-6 w-6'
                        weight='duotone'
                    />
                }
                title={t('clawDetail.previewNotEnabled')}
                action={
                    <Button
                        size='sm'
                        variant='outline'
                        onClick={handleEnable}
                        disabled={enabling}
                    >
                        {enabling && (
                            <CircleNotchIcon className='mr-2 h-3.5 w-3.5 animate-spin' />
                        )}
                        {t('clawDetail.previewEnable')}
                    </Button>
                }
            />
        )
    }

    if (status === PREVIEW_STATUS.ERROR) {
        return (
            <PanelPlaceholder
                icon={
                    <WarningIcon
                        className='text-muted-foreground h-6 w-6'
                        weight='duotone'
                    />
                }
                title={t('clawDetail.previewError')}
                description={t('clawDetail.previewErrorDescription')}
                action={
                    <Button size='sm' variant='outline' onClick={handleRetry}>
                        <ArrowClockwiseIcon className='mr-2 h-3.5 w-3.5' />
                        {t('clawDetail.previewRetry')}
                    </Button>
                }
            />
        )
    }

    if (readOnly) {
        return (
            <div className='flex h-full flex-col items-center justify-center gap-3 p-5'>
                <div className='border-border bg-foreground/5 w-full max-w-md rounded-lg border p-6'>
                    <div className='mb-4 flex items-center gap-2'>
                        <div className='h-2 w-2 rounded-full bg-green-500' />
                        <span className='text-xs font-medium'>{url}</span>
                    </div>
                    <div className='space-y-3'>
                        <div className='bg-foreground/5 h-8 w-3/4 rounded' />
                        <div className='bg-foreground/5 h-4 w-full rounded' />
                        <div className='bg-foreground/5 h-4 w-5/6 rounded' />
                        <div className='bg-foreground/5 h-4 w-2/3 rounded' />
                        <div className='mt-4 flex gap-2'>
                            <div className='bg-foreground/10 h-8 w-20 rounded' />
                            <div className='bg-foreground/10 h-8 w-20 rounded' />
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <iframe
            ref={iframeRef}
            src={url}
            className='h-full w-full border-0'
            allow='clipboard-read; clipboard-write'
            onError={() => setStatus(PREVIEW_STATUS.ERROR)}
        />
    )
}

export default ClawPreviewContent