import type { FC, ReactNode } from 'react'

import { Link } from 'react-router-dom'
import { t } from '@openclaw/i18n'
import { ROUTES } from '@/lib'
import { usePreferencesStore } from '@/lib/store'
import { PRODUCT } from '@/lib/constants'

const ProductSwitcher: FC = (): ReactNode => {
    const product = usePreferencesStore((s) => s.product)
    const setProduct = usePreferencesStore((s) => s.setProduct)

    return (
        <div className='bg-foreground/5 border-border flex items-center gap-0.5 rounded-lg border p-0.5'>
            <Link
                to={ROUTES.HOME}
                onClick={() => setProduct(PRODUCT.CLOUD)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    product === PRODUCT.CLOUD
                        ? 'bg-foreground text-background shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                }`}
            >
                {t('nav.cloud')}
            </Link>
            <Link
                to={ROUTES.GO}
                onClick={() => setProduct(PRODUCT.GO)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    product === PRODUCT.GO
                        ? 'bg-foreground text-background shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                }`}
            >
                {t('nav.go')}
            </Link>
        </div>
    )
}

export default ProductSwitcher