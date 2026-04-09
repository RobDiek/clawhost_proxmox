import type { FC, ReactNode } from 'react'
import type { BillingStatusBadgeProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { Badge } from '@/components/ui'
import { billingStatusConfig } from '@/lib/billing'

const BillingStatusBadge: FC<BillingStatusBadgeProps> = ({
    status
}): ReactNode => {
    const config = billingStatusConfig[status]

    if (!config) {
        return (
            <Badge variant='outline' className='pointer-events-none'>
                {status}
            </Badge>
        )
    }

    return <Badge className={config.className}>{t(config.labelKey)}</Badge>
}

export default BillingStatusBadge