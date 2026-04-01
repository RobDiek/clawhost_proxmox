import type { FeatureEmailDefinition } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { featureEmailKey } from '@/lib/constants'
import TerminalEmail from '@/emails/features/TerminalEmail'
import LogsEmail from '@/emails/features/LogsEmail'
import ChannelsEmail from '@/emails/features/ChannelsEmail'
import FileExplorerEmail from '@/emails/features/FileExplorerEmail'
import PlaygroundEmail from '@/emails/features/PlaygroundEmail'
import AgentChatEmail from '@/emails/features/AgentChatEmail'
import VoiceModeEmail from '@/emails/features/VoiceModeEmail'
import SkillsEmail from '@/emails/features/SkillsEmail'
import BindingsEmail from '@/emails/features/BindingsEmail'
import EnvVarsEmail from '@/emails/features/EnvVarsEmail'
import DiagnosticsEmail from '@/emails/features/DiagnosticsEmail'
import SshKeysEmail from '@/emails/features/SshKeysEmail'
import ExportConfigEmail from '@/emails/features/ExportConfigEmail'
import MultiLanguageEmail from '@/emails/features/MultiLanguageEmail'
import SubdomainEmail from '@/emails/features/SubdomainEmail'
import DarkModeEmail from '@/emails/features/DarkModeEmail'
import ReinstallEmail from '@/emails/features/ReinstallEmail'
import YearlyPlansEmail from '@/emails/features/YearlyPlansEmail'

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
        key: featureEmailKey.channels,
        subject: t('emails.features.channels.subject'),
        render: () => ChannelsEmail({})
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
        key: featureEmailKey.skills,
        subject: t('emails.features.skills.subject'),
        render: () => SkillsEmail({})
    },
    {
        key: featureEmailKey.bindings,
        subject: t('emails.features.bindings.subject'),
        render: () => BindingsEmail({})
    },
    {
        key: featureEmailKey.envVars,
        subject: t('emails.features.envVars.subject'),
        render: () => EnvVarsEmail({})
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
    }
]

export default FEATURE_EMAILS