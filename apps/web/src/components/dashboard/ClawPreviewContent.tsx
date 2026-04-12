import type { FC, ReactNode } from 'react'
import type { ClawPreviewContentProps } from '@/ts/Interfaces'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { t } from '@openclaw/i18n'
import {
    CircleNotchIcon,
    BrowserIcon,
    ArrowClockwiseIcon,
    WarningIcon
} from '@phosphor-icons/react'
import { Button } from '@/components/ui'
import { api, getBaseDomain } from '@/lib'
import { generateSlug } from '@/lib/claw-utils'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { PanelPlaceholder } from '@/components/shared'

const ClawPreviewContent: FC<ClawPreviewContentProps> = ({
    claw
}): ReactNode => {
    const [status, setStatus] = useState<
        'checking' | 'not-enabled' | 'ready' | 'error'
    >('checking')
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
        api.checkPreview(claw.id)
            .then((res) => setStatus(res.enabled ? 'ready' : 'not-enabled'))
            .catch(() => setStatus('not-enabled'))
    }, [claw.id])

    const handleEnable = useCallback(async () => {
        setEnabling(true)
        try {
            await api.enablePreview(claw.id)
            showToast(t('clawDetail.previewEnabled'), TOAST_TYPE.SUCCESS)
            setStatus('ready')
        } catch {
            showToast(t('clawDetail.previewEnableFailed'), TOAST_TYPE.ERROR)
        }
        setEnabling(false)
    }, [claw.id, showToast])

    const handleRetry = useCallback(() => {
        setStatus('ready')
        if (iframeRef.current) iframeRef.current.src = url
    }, [url])

    if (status === 'checking') return null

    if (status === 'not-enabled') {
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

    if (status === 'error') {
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

    return (
        <iframe
            ref={iframeRef}
            src={url}
            className='h-full w-full border-0'
            allow='clipboard-read; clipboard-write'
            onError={() => setStatus('error')}
        />
    )
}

export default ClawPreviewContent