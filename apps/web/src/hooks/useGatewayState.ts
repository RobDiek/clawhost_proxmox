import type { GatewayConnectionState } from '@/ts/Types'

import { useState, useEffect } from 'react'
import { SharedGateway } from '@/lib/gateway'
import { GATEWAY_CONNECTION_STATE } from '@/lib/constants'

const useGatewayState = (
    subdomain: string | null,
    gatewayToken: string | null
): GatewayConnectionState => {
    const [state, setState] = useState<GatewayConnectionState>(
        GATEWAY_CONNECTION_STATE.DISCONNECTED
    )

    useEffect(() => {
        if (!subdomain || !gatewayToken) {
            setState(GATEWAY_CONNECTION_STATE.DISCONNECTED)
            return
        }

        const client = SharedGateway.acquire(subdomain, gatewayToken)

        const handleState = (newState: GatewayConnectionState) => {
            setState(newState)
        }

        client.addStateListener(handleState)
        setState(client.state)

        return () => {
            client.removeStateListener(handleState)
            SharedGateway.release(subdomain)
        }
    }, [subdomain, gatewayToken])

    return state
}

export default useGatewayState