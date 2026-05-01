const serviceState = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    FAILED: 'failed',
    ACTIVATING: 'activating',
    DEACTIVATING: 'deactivating'
} as const

export default serviceState