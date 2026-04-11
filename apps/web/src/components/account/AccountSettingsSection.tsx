import type { FC, ReactNode } from 'react'
import type { AccountSettingsSectionProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { Checkbox } from '@/components/ui'

const AccountSettingsSection: FC<AccountSettingsSectionProps> = ({
    openLinksWindowed,
    setOpenLinksWindowed
}): ReactNode => {
    return (
        <div className='border-border bg-foreground/5 mt-6 rounded-xl border p-8 backdrop-blur-sm'>
            <div className='mb-6'>
                <h2 className='text-lg font-medium'>
                    {t('account.settings')}
                </h2>
                <p className='text-muted-foreground mt-1 text-sm'>
                    {t('account.settingsDescription')}
                </p>
            </div>

            <label className='flex cursor-pointer items-center gap-3'>
                <Checkbox
                    checked={openLinksWindowed}
                    onCheckedChange={(checked) =>
                        setOpenLinksWindowed(!!checked)
                    }
                />
                <div>
                    <span className='text-sm'>
                        {t('account.openLinksWindowed')}
                    </span>
                    <p className='text-muted-foreground text-xs'>
                        {t('account.openLinksWindowedDescription')}
                    </p>
                </div>
            </label>
        </div>
    )
}

export default AccountSettingsSection