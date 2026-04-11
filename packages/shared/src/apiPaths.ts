const API_PATHS = {
    AUTH: {
        SEND_OTP: '/auth/send-otp',
        VERIFY_OTP: '/auth/verify-otp',
        RESOLVE_CONFLICT: '/auth/resolve-credential-conflict'
    },
    PLANS: {
        BASE: '/plans',
        LOCATIONS: '/plans/locations',
        VOLUME_PRICING: '/plans/volume-pricing',
        AVAILABILITY: '/plans/availability'
    },
    CLAWS: {
        BASE: '/claws',
        ADMIN: '/claws/admin',
        PURCHASE: '/claws/purchase',
        byId: (id: string) => `/claws/${id}`,
        PENDING: (id: string) => `/claws/pending/${id}`,
        SYNC: (id: string) => `/claws/${id}/sync`,
        START: (id: string) => `/claws/${id}/start`,
        STOP: (id: string) => `/claws/${id}/stop`,
        RESTART: (id: string) => `/claws/${id}/restart`,
        CANCEL_DELETION: (id: string) => `/claws/${id}/cancel-deletion`,
        HARD_DELETE: (id: string) => `/claws/${id}/hard-delete`,
        SUBDOMAIN: (id: string) => `/claws/${id}/subdomain`,
        REINSTALL: (id: string) => `/claws/${id}/reinstall`,
        CREDENTIALS: (id: string) => `/claws/${id}/credentials`,
        EXPORT: (id: string) => `/claws/${id}/export`,
        DIAGNOSTICS: {
            STATUS: (id: string) => `/claws/${id}/diagnostics/status`,
            LOGS: (id: string) => `/claws/${id}/diagnostics/logs`,
            REPAIR: (id: string) => `/claws/${id}/diagnostics/repair`
        },
        VERSION: (id: string) => `/claws/${id}/version`,
        VERSIONS: (id: string) => `/claws/${id}/versions`,
        INSTALL_VERSION: (id: string) => `/claws/${id}/install-version`,
        FILES: {
            BASE: (id: string) => `/claws/${id}/files`,
            READ: (id: string) => `/claws/${id}/files/read`
        }
    },
    AFFILIATE: {
        BASE: '/affiliate',
        GENERATE: '/affiliate/generate',
        CODE: '/affiliate/code'
    },
    SSH_KEYS: {
        BASE: '/ssh-keys',
        byId: (id: string) => `/ssh-keys/${id}`
    },
    USERS: {
        ME: '/users/me',
        STATS: '/users/me/stats',
        BILLING: '/users/me/billing',
        BILLING_PORTAL: '/users/me/billing/portal',
        LICENSE_CHECKOUT: '/users/me/license/checkout',
        ORDER_INVOICE: (orderId: string) =>
            `/users/me/billing/${orderId}/invoice`,
        AUTH_METHOD: (method: string) => `/users/me/auth/${method}`
    },
    WAITLIST: {
        BASE: '/waitlist',
        STATUS: '/waitlist/status'
    },
    ADMIN: {
        USERS: '/admin/users',
        USER: (id: string) => `/admin/users/${id}`,
        UPDATE_USER: (id: string) => `/admin/users/${id}`,
        STATS: '/admin/stats',
        ANALYTICS: '/admin/analytics',
        BILLING: '/admin/billing',
        CLAWS: '/admin/claws',
        PENDING_CLAWS: '/admin/pending-claws',
        SSH_KEYS: '/admin/ssh-keys',
        VOLUMES: '/admin/volumes',
        REFERRALS: '/admin/referrals',
        WAITLIST: '/admin/waitlist',
        EXPORTS: '/admin/exports',
        EMAILS: '/admin/emails'
    },
    WEBHOOKS: {
        POLAR: '/webhooks/polar'
    }
} as const

export default API_PATHS