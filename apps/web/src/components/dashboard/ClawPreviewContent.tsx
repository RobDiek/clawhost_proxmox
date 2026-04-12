import type { FC, ReactNode } from 'react'
import type { ClawPreviewContentProps } from '@/ts/Interfaces'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { t } from '@openclaw/i18n'
import {
    CircleNotchIcon,
    BrowserIcon,
    ArrowSquareOutIcon
} from '@phosphor-icons/react'
import { api, getBaseDomain } from '@/lib'
import { generateSlug } from '@/lib/claw-utils'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { PanelPlaceholder } from '@/components/shared'
import { Button } from '@/components/ui'

const ClawPreviewContent: FC<ClawPreviewContentProps> = ({
    claw
}): ReactNode => {
    const [status, setStatus] = useState<'loading' | 'ready' | 'blocked'>('loading')
    const [enabling, setEnabling] = useState(false)
    const { showToast } = useUIStore()
    const iframeRef = useRef<HTMLIFrameElement | null>(null)

    const url = useMemo(() => {
        const subdomain = claw.subdomain || generateSlug(claw.id)
        const domain = `${subdomain}.${getBaseDomain()}`
        const token = claw.gatewayToken ? `/?token=${claw.gatewayToken}` : ''
        return `https://${domain}${token}`
    }, [claw.id, claw.subdomain, claw.gatewayToken])

    const handleLoad = useCallback(() => {
        const frame = iframeRef.current
        if (!frame) return
        try {
            const doc = frame.contentDocument || frame.contentWindow?.document
            if (doc && doc.body && doc.body.innerHTML === '') setStatus('blocked')
            else setStatus('ready')
        } catch {
            setStatus('ready')
        }
    }, [])

    useEffect(() => {
        const timeout = setTimeout(() => {
            if (status === 'loading') setStatus('ready')
        }, 8000)
        return () => clearTimeout(timeout)
    }, [status])

    const handleEnable = useCallback(async () => {
        setEnabling(true)
        try {
            await api.enablePreview(claw.id)
            showToast(t('clawDetail.previewEnabled'), TOAST_TYPE.SUCCESS)
            setStatus('loading')
            if (iframeRef.current) iframeRef.current.src = url
        } catch {
            showToast(t('clawDetail.previewEnableFailed'), TOAST_TYPE.ERROR)
        }
        setEnabling(false)
    }, [claw.id, showToast, url])

    if (status === 'blocked') {
        return (
            <PanelPlaceholder
                icon={<BrowserIcon className='text-muted-foreground h-6 w-6' weight='duotone' />}
                title={t('clawDetail.previewNotEnabled')}
                description={t('clawDetail.previewNotEnabledDescription')}
                action={
                    <div className='flex items-center gap-2'>
                        <button
                            onClick={handleEnable}
                            disabled={enabling}
                            className='border-border bg-foreground/5 hover:bg-foreground/10 text-foreground flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50'
                        >
                            {enabling && (
                                <CircleNotchIcon className='h-3.5 w-3.5 animate-spin' />
                            )}
                            {enabling
                                ? t('clawDetail.previewEnabling')
                                : t('clawDetail.previewEnable')}
                        </button>
                        <Button
                            size='sm'
                            variant='outline'
                            onClick={() => window.open(url, '_blank')}
                        >
                            <ArrowSquareOutIcon className='mr-1.5 h-3.5 w-3.5' />
                            {t('clawDetail.tabPreview')}
                        </Button>
                    </div>
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
            onLoad={handleLoad}
        />
    )
}

export default ClawPreviewContent