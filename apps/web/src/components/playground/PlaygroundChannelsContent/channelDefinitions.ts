import type { ChannelDefinition } from '@/ts/Interfaces'

import {
    WhatsappLogoIcon,
    TelegramLogoIcon,
    DiscordLogoIcon,
    SlackLogoIcon,
    ChatCircleIcon
} from '@phosphor-icons/react'

const CHANNEL_DEFINITIONS: ChannelDefinition[] = [
    {
        key: 'whatsapp',
        label: 'playground.channelsWhatsApp',
        icon: WhatsappLogoIcon,
        fields: [
            {
                key: 'dmPolicy',
                label: 'playground.channelsDmPolicy',
                placeholder: 'playground.channelsDmPolicyPairing',
                type: 'select',
                options: [
                    {
                        value: 'pairing',
                        label: 'playground.channelsDmPolicyPairing'
                    },
                    { value: 'open', label: 'playground.channelsDmPolicyOpen' },
                    {
                        value: 'allowlist',
                        label: 'playground.channelsDmPolicyAllowlist'
                    },
                    {
                        value: 'disabled',
                        label: 'playground.channelsDmPolicyDisabled'
                    }
                ]
            },
            {
                key: 'allowFrom',
                label: 'playground.channelsAllowFrom',
                placeholder: 'playground.channelsAllowFromPlaceholder'
            }
        ]
    },
    {
        key: 'telegram',
        label: 'playground.channelsTelegram',
        icon: TelegramLogoIcon,
        fields: [
            {
                key: 'botToken',
                label: 'playground.channelsBotToken',
                placeholder: 'playground.channelsBotTokenPlaceholder',
                required: true,
                secret: true
            }
        ]
    },
    {
        key: 'discord',
        label: 'playground.channelsDiscord',
        icon: DiscordLogoIcon,
        fields: [
            {
                key: 'token',
                label: 'playground.channelsToken',
                placeholder: 'playground.channelsTokenPlaceholder',
                required: true,
                secret: true
            }
        ]
    },
    {
        key: 'slack',
        label: 'playground.channelsSlack',
        icon: SlackLogoIcon,
        fields: [
            {
                key: 'botToken',
                label: 'playground.channelsBotToken',
                placeholder: 'playground.channelsBotTokenPlaceholder',
                required: true,
                secret: true
            },
            {
                key: 'appToken',
                label: 'playground.channelsAppToken',
                placeholder: 'playground.channelsAppTokenPlaceholder',
                required: true,
                secret: true
            },
            {
                key: 'signingSecret',
                label: 'playground.channelsSigningSecret',
                placeholder: 'playground.channelsSigningSecretPlaceholder',
                secret: true
            }
        ]
    },
    {
        key: 'signal',
        label: 'playground.channelsSignal',
        icon: ChatCircleIcon,
        fields: [
            {
                key: 'account',
                label: 'playground.channelsAccount',
                placeholder: 'playground.channelsAccountPlaceholder',
                required: true
            }
        ]
    }
]

export default CHANNEL_DEFINITIONS