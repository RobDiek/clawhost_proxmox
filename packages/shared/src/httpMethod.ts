const httpMethod = {
    GET: 'GET',
    POST: 'POST',
    PUT: 'PUT',
    PATCH: 'PATCH',
    DELETE: 'DELETE',
    OPTIONS: 'OPTIONS',
    HEAD: 'HEAD',
    ALL: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as string[]
} as const

export { httpMethod }