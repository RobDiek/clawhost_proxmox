import type { AdminPaginatedQueryParams } from '@/ts/Interfaces'

const buildAdminPaginatedQuery = ({
    page,
    limit,
    search,
    sort,
    ...extras
}: AdminPaginatedQueryParams): string => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(limit))
    if (search) params.set('search', search)
    if (sort) params.set('sort', sort)
    for (const [key, value] of Object.entries(extras)) {
        if (value !== undefined && value !== null && value !== '') {
            params.set(key, String(value))
        }
    }
    return params.toString()
}

export default buildAdminPaginatedQuery