import type { FC, ReactNode } from 'react'

import { t } from '@openclaw/i18n'
import { usePreferencesStore } from '@/lib/store'
import { Checkbox } from '@/components/ui'

const AdminSettingsTab: FC = (): ReactNode => {
    const { adminMode, setAdminMode } = usePreferencesStore()

    return (
        <div>
            <div className='mb-6'>
                <h2 className='text-lg font-medium'>
                    {t('admin.settingsTab')}
                </h2>
                <p className='text-muted-foreground mt-1 text-sm'>
                    {t('admin.settingsDescription')}
                </p>
            </div>

            <label className='flex cursor-pointer items-center gap-3'>
                <Checkbox
                    checked={adminMode}
                    onCheckedChange={(checked) => setAdminMode(!!checked)}
                />
                <span className='text-sm'>{t('admin.showAllAgents')}</span>
            </label>
        </div>
    )
}

export default AdminSettingsTab