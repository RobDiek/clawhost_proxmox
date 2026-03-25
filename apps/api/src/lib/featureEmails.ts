import type { FeatureEmailDefinition } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
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
        key: 'terminal',
        subject: t('emails.features.terminal.subject'),
        render: () => TerminalEmail({})
    },
    {
        key: 'logs',
        subject: t('emails.features.logs.subject'),
        render: () => LogsEmail({})
    },
    {
        key: 'channels',
        subject: t('emails.features.channels.subject'),
        render: () => ChannelsEmail({})
    },
    {
        key: 'fileExplorer',
        subject: t('emails.features.fileExplorer.subject'),
        render: () => FileExplorerEmail({})
    },
    {
        key: 'playground',
        subject: t('emails.features.playground.subject'),
        render: () => PlaygroundEmail({})
    },
    {
        key: 'agentChat',
        subject: t('emails.features.agentChat.subject'),
        render: () => AgentChatEmail({})
    },
    {
        key: 'voiceMode',
        subject: t('emails.features.voiceMode.subject'),
        render: () => VoiceModeEmail({})
    },
    {
        key: 'skills',
        subject: t('emails.features.skills.subject'),
        render: () => SkillsEmail({})
    },
    {
        key: 'bindings',
        subject: t('emails.features.bindings.subject'),
        render: () => BindingsEmail({})
    },
    {
        key: 'envVars',
        subject: t('emails.features.envVars.subject'),
        render: () => EnvVarsEmail({})
    },
    {
        key: 'diagnostics',
        subject: t('emails.features.diagnostics.subject'),
        render: () => DiagnosticsEmail({})
    },
    {
        key: 'sshKeys',
        subject: t('emails.features.sshKeys.subject'),
        render: () => SshKeysEmail({})
    },
    {
        key: 'exportConfig',
        subject: t('emails.features.exportConfig.subject'),
        render: () => ExportConfigEmail({})
    },
    {
        key: 'multiLanguage',
        subject: t('emails.features.multiLanguage.subject'),
        render: () => MultiLanguageEmail({})
    },
    {
        key: 'subdomain',
        subject: t('emails.features.subdomain.subject'),
        render: () => SubdomainEmail({})
    },
    {
        key: 'darkMode',
        subject: t('emails.features.darkMode.subject'),
        render: () => DarkModeEmail({})
    },
    {
        key: 'reinstall',
        subject: t('emails.features.reinstall.subject'),
        render: () => ReinstallEmail({})
    },
    {
        key: 'yearlyPlans',
        subject: t('emails.features.yearlyPlans.subject'),
        render: () => YearlyPlansEmail({})
    }
]

export default FEATURE_EMAILS