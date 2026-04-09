import type { PurchaseClawData } from '@/ts/Interfaces'

import { api } from '@/lib'
import createApiMutation from '@/hooks/createApiMutation'

const usePurchaseClaw = createApiMutation((data: PurchaseClawData) =>
    api.purchaseClaw(data)
)

export default usePurchaseClaw