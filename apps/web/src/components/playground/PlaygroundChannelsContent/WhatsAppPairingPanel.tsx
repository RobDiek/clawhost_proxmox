import type { FC, ReactNode } from 'react'
import type { WhatsAppPairingPanelProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { t } from '@openclaw/i18n'
import { CircleNotchIcon, LinkSimpleIcon } from '@phosphor-icons/react'

const WhatsAppPairingPanel: FC<WhatsAppPairingPanelProps> = ({
    whatsAppPairing,
    initialCheckDone,
    whatsAppEnabled
}): ReactNode => {
    const {
        isPairing,
        isRepairing,
        isWhatsAppPaired,
        pairStatus,
        qrImageUrl,
        qrRefreshed,
        pairMutationPending,
        triggerPair,
        triggerRepair
    } = whatsAppPairing

    if (isPairing && pairStatus?.status === 'qr_ready' && pairStatus.qr) {
        return (
            <div className='space-y-2'>
                {qrRefreshed && (
                    <p className='rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-500'>
                        {t('playground.channelsWhatsAppQrRefreshed')}
                    </p>
                )}
                <p className='text-muted-foreground text-[11px]'>
                    {t('playground.channelsWhatsAppScanQr')}
                </p>
                <div className='flex items-center justify-center rounded-md border bg-white p-4'>
                    <img
                        src={qrImageUrl}
                        alt='WhatsApp QR Code'
                        className='h-48 w-48'
                        style={{ imageRendering: 'pixelated' }}
                    />
                </div>
                <p className='text-muted-foreground text-center text-[10px]'>
                    {t('playground.channelsWhatsAppScanInstructions')}
                </p>
            </div>
        )
    }

    if (
        isPairing ||
        pairMutationPending ||
        isRepairing ||
        (!initialCheckDone && whatsAppEnabled)
    ) {
        return (
            <button
                type='button'
                disabled
                className={`flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-[11px] font-medium opacity-70 ${
                    isRepairing
                        ? 'border-border bg-foreground/5 text-muted-foreground'
                        : 'border-[#25D366]/30 bg-[#25D366]/10 text-[#25D366]'
                }`}
            >
                <CircleNotchIcon className='h-3.5 w-3.5 animate-spin' />
                {t(
                    isRepairing
                        ? 'playground.channelsWhatsAppRepair'
                        : 'playground.channelsWhatsAppPairDevice'
                )}
            </button>
        )
    }

    if (pairStatus?.status === 'failed') {
        return (
            <div className='space-y-2'>
                <p className='text-[11px] text-red-400'>
                    {t('playground.channelsWhatsAppPairFailed')}
                </p>
                {pairStatus.log && (
                    <pre className='bg-background max-h-24 overflow-auto rounded-md border p-2 font-mono text-[10px] text-red-400/70'>
                        {pairStatus.log}
                    </pre>
                )}
                <button
                    type='button'
                    onClick={() => triggerPair(undefined)}
                    className='flex w-full items-center justify-center gap-2 rounded-md border border-[#25D366]/30 bg-[#25D366]/10 px-3 py-2 text-[11px] font-medium text-[#25D366] transition-colors hover:bg-[#25D366]/20'
                >
                    <LinkSimpleIcon className='h-3.5 w-3.5' />
                    {t('playground.channelsWhatsAppPairDevice')}
                </button>
            </div>
        )
    }

    if (isWhatsAppPaired) {
        return (
            <button
                type='button'
                onClick={triggerRepair}
                disabled={pairMutationPending || isPairing}
                className='border-border bg-foreground/5 hover:bg-foreground/10 text-muted-foreground flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'
            >
                {pairMutationPending || isPairing ? (
                    <CircleNotchIcon className='h-3.5 w-3.5 animate-spin' />
                ) : (
                    <LinkSimpleIcon className='h-3.5 w-3.5' />
                )}
                {t('playground.channelsWhatsAppRepair')}
            </button>
        )
    }

    return (
        <Fragment>
            <button
                type='button'
                onClick={() => triggerPair(undefined)}
                className='flex w-full items-center justify-center gap-2 rounded-md border border-[#25D366]/30 bg-[#25D366]/10 px-3 py-2 text-[11px] font-medium text-[#25D366] transition-colors hover:bg-[#25D366]/20'
            >
                <LinkSimpleIcon className='h-3.5 w-3.5' />
                {t('playground.channelsWhatsAppPairDevice')}
            </button>
        </Fragment>
    )
}

export default WhatsAppPairingPanel