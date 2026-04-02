import type { FooterLink } from '@/ts/Interfaces'

import { useMemo } from 'react'
import { t } from '@openclaw/i18n'
import { getBaseDomain } from '@/lib'
import { getLegalLinks } from '@/data'

const useLocalFooterLinks = (isLocal: boolean): FooterLink[] | undefined => {
    const dropdownFooterLinks = useMemo(() => {
        if (!isLocal) return undefined
        const BASE_URL = `https://${getBaseDomain()}`
        return [
            { label: t('footer.website'), href: BASE_URL, external: true },
            ...getLegalLinks().map((link) => ({
                ...link,
                href: link.href.startsWith('mailto:')
                    ? link.href
                    : `${BASE_URL}${link.href}`,
                external: true
            }))
        ]
    }, [isLocal])

    return dropdownFooterLinks
}

export default useLocalFooterLinks