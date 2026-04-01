const GATEWAY_CONNECTION_STATE = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    AUTHENTICATING: 'authenticating',
    CONNECTED: 'connected',
    ERROR: 'error'
} as const

export default GATEWAY_CONNECTION_STATE