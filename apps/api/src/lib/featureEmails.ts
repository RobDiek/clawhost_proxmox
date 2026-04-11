import type { FeatureEmailDefinition } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { featureEmailKey } from '@/lib/constants'
import TerminalEmail from '@/emails/TerminalEmail'
import LogsEmail from '@/emails/LogsEmail'
import FileExplorerEmail from '@/emails/FileExplorerEmail'
import PlaygroundEmail from '@/emails/PlaygroundEmail'
import AgentChatEmail from '@/emails/AgentChatEmail'
import VoiceModeEmail from '@/emails/VoiceModeEmail'
import DiagnosticsEmail from '@/emails/DiagnosticsEmail'
import SshKeysEmail from '@/emails/SshKeysEmail'
import ExportConfigEmail from '@/emails/ExportConfigEmail'
import MultiLanguageEmail from '@/emails/MultiLanguageEmail'
import SubdomainEmail from '@/emails/SubdomainEmail'
import DarkModeEmail from '@/emails/DarkModeEmail'
import ReinstallEmail from '@/emails/ReinstallEmail'
import YearlyPlansEmail from '@/emails/YearlyPlansEmail'
import SimplifiedPlatformEmail from '@/emails/SimplifiedPlatformEmail'

const FEATURE_EMAILS: FeatureEmailDefinition[] = [
    {
        key: featureEmailKey.terminal,
        subject: t('emails.features.terminal.subject'),
        render: () => TerminalEmail({})
    },
    {
        key: featureEmailKey.logs,
        subject: t('emails.features.logs.subject'),
        render: () => LogsEmail({})
    },
    {
        key: featureEmailKey.fileExplorer,
        subject: t('emails.features.fileExplorer.subject'),
        render: () => FileExplorerEmail({})
    },
    {
        key: featureEmailKey.playground,
        subject: t('emails.features.playground.subject'),
        render: () => PlaygroundEmail({})
    },
    {
        key: featureEmailKey.agentChat,
        subject: t('emails.features.agentChat.subject'),
        render: () => AgentChatEmail({})
    },
    {
        key: featureEmailKey.voiceMode,
        subject: t('emails.features.voiceMode.subject'),
        render: () => VoiceModeEmail({})
    },
    {
        key: featureEmailKey.diagnostics,
        subject: t('emails.features.diagnostics.subject'),
        render: () => DiagnosticsEmail({})
    },
    {
        key: featureEmailKey.sshKeys,
        subject: t('emails.features.sshKeys.subject'),
        render: () => SshKeysEmail({})
    },
    {
        key: featureEmailKey.exportConfig,
        subject: t('emails.features.exportConfig.subject'),
        render: () => ExportConfigEmail({})
    },
    {
        key: featureEmailKey.multiLanguage,
        subject: t('emails.features.multiLanguage.subject'),
        render: () => MultiLanguageEmail({})
    },
    {
        key: featureEmailKey.subdomain,
        subject: t('emails.features.subdomain.subject'),
        render: () => SubdomainEmail({})
    },
    {
        key: featureEmailKey.darkMode,
        subject: t('emails.features.darkMode.subject'),
        render: () => DarkModeEmail({})
    },
    {
        key: featureEmailKey.reinstall,
        subject: t('emails.features.reinstall.subject'),
        render: () => ReinstallEmail({})
    },
    {
        key: featureEmailKey.yearlyPlans,
        subject: t('emails.features.yearlyPlans.subject'),
        render: () => YearlyPlansEmail({})
    },
    {
        key: featureEmailKey.simplifiedPlatform,
        subject: t('emails.features.simplifiedPlatform.subject'),
        render: () => SimplifiedPlatformEmail({})
    }
]

export default FEATURE_EMAILS