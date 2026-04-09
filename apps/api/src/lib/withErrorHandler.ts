import type { Context } from 'hono'
import type { TranslationKey } from '@openclaw/i18n'

import { t } from '@openclaw/i18n'
import { fail } from '@/lib/response'

const withErrorHandler = (name: string, fallbackKey?: TranslationKey) => {
    return <C extends Context, T>(handler: (c: C) => Promise<T>) => {
        return async (c: C): Promise<T | Response> => {
            try {
                return await handler(c)
            } catch (error) {
                console.error(name, error)
                return fail(c, t(fallbackKey ?? 'api.internalServerError'), 500)
            }
        }
    }
}

export default withErrorHandler