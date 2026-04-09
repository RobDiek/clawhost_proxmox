import type { FC, ReactNode } from 'react'
import type { ChannelCardProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { t } from '@openclaw/i18n'
import { CheckIcon } from '@phosphor-icons/react'
import WhatsAppPairingPanel from '@/components/playground/PlaygroundChannelsContent/WhatsAppPairingPanel'
import ChannelFieldInput from '@/components/playground/PlaygroundChannelsContent/ChannelFieldInput'

const ChannelCard: FC<ChannelCardProps> = ({
    def,
    config,
    isWhatsAppPaired,
    visibleSecrets,
    toggleSecret,
    toggleChannel,
    updateField,
    copyField,
    whatsAppPairing,
    initialCheckDone,
    whatsAppEnabled
}): ReactNode => {
    const Icon = def.icon

    return (
        <div
            className={`rounded-lg border transition-colors ${
                config.enabled
                    ? 'border-[#ef5350]/30 bg-[#ef5350]/5'
                    : 'border-border bg-foreground/[0.02]'
            }`}
        >
            <button
                type='button'
                onClick={() => toggleChannel(def.key)}
                className='flex w-full items-center gap-2 px-3.5 py-3'
            >
                <div
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        config.enabled
                            ? 'border-[#ef5350] bg-[#ef5350]'
                            : 'border-border bg-foreground/5'
                    }`}
                >
                    {config.enabled && (
                        <CheckIcon
                            className='h-3 w-3 text-white'
                            weight='bold'
                        />
                    )}
                </div>
                <Icon className='text-muted-foreground h-4 w-4' />
                <span className='text-foreground text-sm font-medium'>
                    {t(def.label)}
                </span>
                {def.key === 'whatsapp' &&
                    config.enabled &&
                    isWhatsAppPaired && (
                        <span className='ml-auto flex items-center gap-1.5 text-[10px] font-medium text-[#25D366]'>
                            <span className='h-1.5 w-1.5 rounded-full bg-[#25D366]' />
                            {t('playground.channelsWhatsAppConnected')}
                        </span>
                    )}
            </button>

            {config.enabled && def.key === 'whatsapp' && (
                <div className='border-border space-y-3 border-t px-3.5 pb-3.5 pt-3'>
                    <WhatsAppPairingPanel
                        whatsAppPairing={whatsAppPairing}
                        initialCheckDone={initialCheckDone}
                        whatsAppEnabled={whatsAppEnabled}
                    />
                    {def.fields.map((field) => (
                        <Fragment key={`${def.key}-${String(field.key)}`}>
                            <ChannelFieldInput
                                def={def}
                                field={field}
                                config={config}
                                visibleSecrets={visibleSecrets}
                                toggleSecret={toggleSecret}
                                updateField={updateField}
                                copyField={copyField}
                            />
                        </Fragment>
                    ))}
                </div>
            )}

            {config.enabled &&
                def.key !== 'whatsapp' &&
                def.fields.length > 0 && (
                    <div className='border-border space-y-3 border-t px-3.5 pb-3.5 pt-3'>
                        {def.fields.map((field) => (
                            <Fragment key={`${def.key}-${String(field.key)}`}>
                                <ChannelFieldInput
                                    def={def}
                                    field={field}
                                    config={config}
                                    visibleSecrets={visibleSecrets}
                                    toggleSecret={toggleSecret}
                                    updateField={updateField}
                                    copyField={copyField}
                                />
                            </Fragment>
                        ))}
                    </div>
                )}
        </div>
    )
}

export default ChannelCard