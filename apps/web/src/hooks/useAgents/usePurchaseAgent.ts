import type { PurchaseAgentData } from '@/ts/Interfaces'

import { api } from '@/lib'
import createApiMutation from '@/hooks/createApiMutation'

const usePurchaseAgent = createApiMutation((data: PurchaseAgentData) =>
    api.purchaseAgent(data)
)

export default usePurchaseAgent