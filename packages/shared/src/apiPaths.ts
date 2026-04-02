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
        ENV: (id: string) => `/claws/${id}/env`,
        EXPORT: (id: string) => `/claws/${id}/export`,
        DIAGNOSTICS: {
            STATUS: (id: string) => `/claws/${id}/diagnostics/status`,
            LOGS: (id: string) => `/claws/${id}/diagnostics/logs`,
            REPAIR: (id: string) => `/claws/${id}/diagnostics/repair`
        },
        VERSION: (id: string) => `/claws/${id}/version`,
        VERSIONS: (id: string) => `/claws/${id}/versions`,
        INSTALL_VERSION: (id: string) => `/claws/${id}/install-version`,
        AGENTS: {
            BASE: (id: string) => `/claws/${id}/agents`,
            CREATE: (id: string) => `/claws/${id}/agents/create`,
            DELETE: (id: string) => `/claws/${id}/agents/delete`,
            CONFIG: (id: string) => `/claws/${id}/agent-config`,
            SKILLS: (clawId: string, agentId: string) =>
                `/claws/${clawId}/agents/${agentId}/skills`
        },
        CHANNELS: {
            BASE: (id: string) => `/claws/${id}/channels`,
            WHATSAPP_PAIR: (id: string) =>
                `/claws/${id}/channels/whatsapp/pair`,
            WHATSAPP_PAIR_STATUS: (id: string) =>
                `/claws/${id}/channels/whatsapp/pair-status`
        },
        BINDINGS: (id: string) => `/claws/${id}/bindings`,
        SKILLS: (id: string) => `/claws/${id}/skills`,
        FILES: {
            BASE: (id: string) => `/claws/${id}/files`,
            READ: (id: string) => `/claws/${id}/files/read`
        },
        CLAWHUB: {
            SKILLS: (id: string) => `/claws/${id}/clawhub/skills`,
            INSTALLED: (id: string) => `/claws/${id}/clawhub/installed`,
            INSTALL: (id: string) => `/claws/${id}/clawhub/install`,
            REMOVE: (id: string) => `/claws/${id}/clawhub/remove`,
            UPDATE: (id: string) => `/claws/${id}/clawhub/update`,
            UPDATES: (id: string) => `/claws/${id}/clawhub/updates`
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
    AI: {
        TTS: '/ai/tts',
        VOICES: '/ai/voices'
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