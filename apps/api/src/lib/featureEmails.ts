import type { FeatureEmailDefinition } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { featureEmailKey } from '@/lib/constants'
import TerminalEmail from '@/emails/TerminalEmail'
import LogsEmail from '@/emails/LogsEmail'
import ChannelsEmail from '@/emails/ChannelsEmail'
import FileExplorerEmail from '@/emails/FileExplorerEmail'
import PlaygroundEmail from '@/emails/PlaygroundEmail'
import AgentChatEmail from '@/emails/AgentChatEmail'
import VoiceModeEmail from '@/emails/VoiceModeEmail'
import SkillsEmail from '@/emails/SkillsEmail'
import BindingsEmail from '@/emails/BindingsEmail'
import EnvVarsEmail from '@/emails/EnvVarsEmail'
import DiagnosticsEmail from '@/emails/DiagnosticsEmail'
import SshKeysEmail from '@/emails/SshKeysEmail'
import ExportConfigEmail from '@/emails/ExportConfigEmail'
import MultiLanguageEmail from '@/emails/MultiLanguageEmail'
import SubdomainEmail from '@/emails/SubdomainEmail'
import DarkModeEmail from '@/emails/DarkModeEmail'
import ReinstallEmail from '@/emails/ReinstallEmail'
import YearlyPlansEmail from '@/emails/YearlyPlansEmail'

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