import type { FeatureEmailDefinition } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { featureEmailKey } from '@/lib/constants'

import { 
    TerminalEmail,
    LogsEmail,
    FileExplorerEmail,
    DiagnosticsEmail,
    SshKeysEmail,
    ExportConfigEmail,
    MultiLanguageEmail,
    SubdomainEmail,
    DarkModeEmail,
    ReinstallEmail,
    YearlyPlansEmail
} from '@/emails'

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