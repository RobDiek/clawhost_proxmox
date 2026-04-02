import type { FC, ReactNode } from 'react'
import type { AdminUserFiltersProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import {
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger
} from '@/components/ui'
import { MagnifyingGlassIcon } from '@phosphor-icons/react'

const AdminUserFilters: FC<AdminUserFiltersProps> = ({
    search,
    onSearchChange,
    hasClaws,
    onHasClawsChange,
    sortOrder,
    onSortOrderChange
}): ReactNode => {
    return (
        <div className='mb-4 flex flex-col gap-3 sm:flex-row sm:items-center'>
            <h3 className='text-xl font-semibold'>{t('admin.usersTab')}</h3>
            <div className='relative flex-1'>
                <MagnifyingGlassIcon className='text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2' />
                <Input
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder={t('admin.searchPlaceholder')}
                    className='bg-background h-10 pl-9'
                />
            </div>
            <Select value={sortOrder} onValueChange={onSortOrderChange}>
                <SelectTrigger
                    className='h-10 w-full sm:w-40'
                    placeholder={
                        sortOrder === 'newest'
                            ? t('admin.sortNewest')
                            : t('admin.sortOldest')
                    }
                />
                <SelectContent>
                    <SelectItem value='newest'>
                        {t('admin.sortNewest')}
                    </SelectItem>
                    <SelectItem value='oldest'>
                        {t('admin.sortOldest')}
                    </SelectItem>
                </SelectContent>
            </Select>
            <Select value={hasClaws} onValueChange={onHasClawsChange}>
                <SelectTrigger
                    className='h-10 w-full sm:w-40'
                    placeholder={
                        hasClaws === 'all'
                            ? t('admin.filterAll')
                            : hasClaws === 'true'
                              ? t('admin.filterWithClaws')
                              : t('admin.filterWithoutClaws')
                    }
                />
                <SelectContent>
                    <SelectItem value='all'>{t('admin.filterAll')}</SelectItem>
                    <SelectItem value='true'>
                        {t('admin.filterWithClaws')}
                    </SelectItem>
                    <SelectItem value='false'>
                        {t('admin.filterWithoutClaws')}
                    </SelectItem>
                </SelectContent>
            </Select>
        </div>
    )
}

export default AdminUserFilters