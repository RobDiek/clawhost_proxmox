import {
    pgTable,
    text,
    timestamp,
    integer,
    boolean,
    decimal,
    jsonb,
    index,
    unique,
    uuid
} from 'drizzle-orm/pg-core'
import { userRole } from '@openclaw/shared'

export const users = pgTable('users', {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    name: text('name'),
    authMethods: text('auth_methods').array().default([]),
    polarCustomerId: text('polar_customer_id'),
    hasLicense: boolean('has_license').notNull().default(false),
    role: text('role').notNull().default(userRole.user),
    totpSecret: text('totp_secret'),          // TOTP 2FA secret (base32 encoded)
    totpEnabled: boolean('totp_enabled').default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
        .defaultNow()
        .notNull()
})

export const claws = pgTable(
    'claws',
    {
        id: text('id').primaryKey(),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        provider: text('provider').notNull().default('hetzner'),
        providerServerId: text('provider_server_id'),
        status: text('status').notNull().default('creating'),
        ip: text('ip'),
        planId: text('plan_id').notNull(),
        location: text('location'),
        rootPassword: text('root_password'),
        sshKeyId: text('ssh_key_id').references(() => sshKeys.id, {
            onDelete: 'set null'
        }),
        subdomain: text('subdomain').unique(),
        gatewayToken: text('gateway_token'),
        polarSubscriptionId: text('polar_subscription_id').unique(),
        polarProductId: text('polar_product_id'),
        polarCustomerId: text('polar_customer_id'),
        subscriptionStatus: text('subscription_status').default('pending'),
        billingInterval: text('billing_interval'),
        deletionScheduledAt: timestamp('deletion_scheduled_at', {
            withTimezone: true
        }),
        lastReinstalledAt: timestamp('last_reinstalled_at', {
            withTimezone: true
        }),
        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => [
        index('claws_user_id_idx').on(table.userId),
        index('claws_polar_subscription_id_idx').on(table.polarSubscriptionId),
        index('claws_subdomain_idx').on(table.subdomain),
        index('claws_deletion_scheduled_at_idx').on(table.deletionScheduledAt)
    ]
)

export const pendingClaws = pgTable(
    'pending_claws',
    {
        id: text('id').primaryKey(),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        checkoutId: text('checkout_id').notNull().unique(),
        name: text('name').notNull(),
        provider: text('provider').notNull().default('hetzner'),
        planId: text('plan_id').notNull(),
        location: text('location').notNull(),
        rootPassword: text('root_password'),
        sshKeyId: text('ssh_key_id').references(() => sshKeys.id, {
            onDelete: 'set null'
        }),
        volumeSize: integer('volume_size'),
        priceMonthly: integer('price_monthly').notNull(),
        billingInterval: text('billing_interval'),
        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
    },
    (table) => [
        index('pending_claws_user_id_idx').on(table.userId),
        index('pending_claws_expires_at_idx').on(table.expiresAt)
    ]
)

export const sshKeys = pgTable(
    'ssh_keys',
    {
        id: text('id').primaryKey(),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        publicKey: text('public_key').notNull(),
        fingerprint: text('fingerprint').notNull(),
        providerKeyId: integer('provider_key_id'),
        digitaloceanKeyId: integer('digitalocean_key_id'),
        vultrKeyId: integer('vultr_key_id'),
        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => [
        index('ssh_keys_user_id_idx').on(table.userId),
        unique('ssh_keys_user_fingerprint').on(table.userId, table.fingerprint)
    ]
)

export const rateLimits = pgTable('rate_limits', {
    key: text('key').primaryKey(),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }).notNull()
})

export const otpCodes = pgTable(
    'otp_codes',
    {
        id: text('id').primaryKey(),
        email: text('email').notNull(),
        codeHash: text('code_hash').notNull(),
        attempts: integer('attempts').notNull().default(0),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => [index('otp_codes_email_idx').on(table.email)]
)

export const clawExports = pgTable(
    'claw_exports',
    {
        id: text('id').primaryKey(),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        clawId: text('claw_id')
            .notNull()
            .references(() => claws.id, { onDelete: 'cascade' }),
        fileSize: integer('file_size'),
        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => [index('claw_exports_claw_id_idx').on(table.clawId)]
)

export const emails = pgTable(
    'emails',
    {
        id: text('id').primaryKey(),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        feature: text('feature').notNull(),
        sentAt: timestamp('sent_at', { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => [
        index('emails_user_id_idx').on(table.userId),
        unique('emails_user_feature').on(table.userId, table.feature)
    ]
)

export const waitlist = pgTable(
    'waitlist',
    {
        id: text('id').primaryKey(),
        email: text('email').notNull().unique(),
        userId: text('user_id').references(() => users.id, {
            onDelete: 'set null'
        }),
        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => [index('waitlist_email_idx').on(table.email)]
)

export const volumes = pgTable(
    'volumes',
    {
        id: text('id').primaryKey(),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        clawId: text('claw_id').references(() => claws.id, {
            onDelete: 'cascade'
        }),
        name: text('name').notNull(),
        size: integer('size').notNull(),
        providerVolumeId: integer('provider_volume_id'),
        location: text('location').notNull(),
        status: text('status').notNull().default('creating'),
        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => [
        index('volumes_user_id_idx').on(table.userId),
        index('volumes_claw_id_idx').on(table.clawId)
    ]
)

// ═══════════════════════════════════════════════════
// OpenClaw Hosting by Flowmatic — custom tables
// ═══════════════════════════════════════════════════

export const instances = pgTable(
    'instances',
    {
        id: text('id').primaryKey(),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),

        // Config (from configurator)
        selectedComponents: jsonb('selected_components').$type<string[]>(),
        automationTool: text('automation_tool'),
        aiProvider: text('ai_provider'),
        storageGb: integer('storage_gb').default(0),

        // Plan (auto-calculated)
        planKey: text('plan_key').notNull(),
        priceIls: decimal('price_ils', { precision: 10, scale: 2 }),

        // Infrastructure
        status: text('status').notNull().default('provisioning'),
        hetznerServerId: text('hetzner_server_id'),
        ip: text('ip'),
        subdomainAgent: text('subdomain_agent'),
        subdomainFlows: text('subdomain_flows'),

        // Credentials (encrypted at rest)
        openclawToken: text('openclaw_token'),
        automationPassword: text('automation_password'),
        rootPassword: text('root_password'),

        // Billing (AllPay)
        allpaySubscriptionId: text('allpay_subscription_id'),
        allpayOrderId: text('allpay_order_id'),
        subscriptionStatus: text('subscription_status').default('pending'),
        nextBillingAt: timestamp('next_billing_at', { withTimezone: true }),

        // Onboarding
        onboardingStep: integer('onboarding_step').default(0),
        onboardingCompleted: boolean('onboarding_completed').default(false),

        // Research (for MATEH)
        researchData: jsonb('research_data'),

        // Custom subdomain (e.g. "sergei" -> sergei.clawflow.flowmatic.co.il)
        subdomainName: text('subdomain_name').unique(),

        // AI Provider keys (user's own keys)
        aiProviderKey: text('ai_provider_key'),     // Anthropic key
        aiProviderType: text('ai_provider_type'),   // 'anthropic' | 'openai'
        openaiApiKey: text('openai_api_key'),       // OpenAI key (separate, both can coexist)

        // Sub-agent model configuration (from dashboard selector)
        subAgentModels: jsonb('sub_agent_models'),  // { sayer: "anthropic/claude-opus-4-6", ... }

        // Google Workspace OAuth tokens
        googleTokens: jsonb('google_tokens'),       // { accessToken, refreshToken, expiresAt, scopes[], email }
        metaTokens: jsonb('meta_tokens'),             // { appId, appSecret, userAccessToken, pageAccessToken, pageId, instagramAccountId, adAccountId }
        microsoftTokens: jsonb('microsoft_tokens'),   // { accessToken, refreshToken, expiresAt, scopes[], email }

        // Telegram
        telegramChatId: text('telegram_chat_id'),
        telegramBotToken: text('telegram_bot_token'),

        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull(),
        suspendedAt: timestamp('suspended_at', { withTimezone: true })
    },
    (table) => [
        index('instances_user_id_idx').on(table.userId),
        index('instances_status_idx').on(table.status),
        index('instances_allpay_order_id_idx').on(table.allpayOrderId)
    ]
)

export const payments = pgTable(
    'payments',
    {
        id: text('id').primaryKey(),
        instanceId: text('instance_id')
            .notNull()
            .references(() => instances.id, { onDelete: 'cascade' }),
        allpayOrderId: text('allpay_order_id'),
        amountIls: decimal('amount_ils', { precision: 10, scale: 2 }),
        status: text('status').notNull().default('pending'),
        paidAt: timestamp('paid_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => [
        index('payments_instance_id_idx').on(table.instanceId),
        index('payments_allpay_order_id_idx').on(table.allpayOrderId)
    ]
)

export const instanceAddons = pgTable(
    'instance_addons',
    {
        id: text('id').primaryKey(),
        instanceId: text('instance_id')
            .notNull()
            .references(() => instances.id, { onDelete: 'cascade' }),
        addonType: text('addon_type').notNull(),
        storageGb: integer('storage_gb'),
        priceIls: decimal('price_ils', { precision: 10, scale: 2 }),
        allpaySubscriptionId: text('allpay_subscription_id'),
        status: text('status').notNull().default('active'),
        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => [
        index('instance_addons_instance_id_idx').on(table.instanceId)
    ]
)

// ── Agent Outputs (approval queue) ──
export const agentOutputs = pgTable(
    'agent_outputs',
    {
        id: text('id').primaryKey(), // randomBytes(6).toString('hex')
        instanceId: text('instance_id')
            .notNull()
            .references(() => instances.id, { onDelete: 'cascade' }),

        // What
        agentRole: text('agent_role').notNull(),    // 'sayer', 'et', 'yotzer', 'mateh', etc.
        outputType: text('output_type').notNull(),  // 'daily_brief', 'weekly_report', 'content_post', 'media_image', 'aeo_audit'
        title: text('title').notNull(),
        content: text('content'),                   // Main text (markdown)

        // Media
        mediaUrl: text('media_url'),                // URL to image/video on VPS or CDN
        mediaType: text('media_type'),              // 'image/png', 'video/mp4', etc.
        mediaMeta: jsonb('media_meta'),              // { width, height, alt_text }

        // Context
        platform: text('platform'),                 // 'instagram', 'linkedin', 'blog', 'telegram'
        scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
        metadata: jsonb('metadata'),                // { model, tokens, duration, session_id, pillar }

        // Workflow
        status: text('status').notNull().default('pending_review'),
        // pending_review → approved → published | rejected
        editedContent: text('edited_content'),      // User's edit (original preserved)
        rejectionReason: text('rejection_reason'),
        approvedAt: timestamp('approved_at', { withTimezone: true }),
        publishedAt: timestamp('published_at', { withTimezone: true }),
        approvedBy: text('approved_by'),

        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => [
        index('agent_outputs_instance_idx').on(table.instanceId),
        index('agent_outputs_status_idx').on(table.instanceId, table.status),
        index('agent_outputs_scheduled_idx').on(table.instanceId, table.scheduledFor)
    ]
)