import type { Context } from 'hono'
import { calcTotal } from '@openclaw/shared'
import { ok, fail } from '@/lib/response'

export const configureInstance = async (c: Context) => {
    try {
        const body = await c.req.json()
        const { components, automationTool, addons } = body as {
            components: string[]
            automationTool: 'activepieces'
            addons: string[]
        }

        if (!components?.length) {
            return fail(c, 'At least one component is required.', 400)
        }

        const result = calcTotal(components, addons || [])

        return ok(c, {
            planKey: result.planKey,
            plan: result.plan,
            ramNeeded: result.ramNeeded,
            planPrice: result.planPrice,
            addonsPrice: result.addonsPrice,
            totalPrice: result.totalPrice,
            components,
            automationTool: automationTool || 'activepieces',
            addons: addons || []
        }, 'Configuration calculated.')
    } catch (err) {
        console.error('Configure error:', err)
        return fail(c, 'Failed to calculate configuration.', 500)
    }
}
