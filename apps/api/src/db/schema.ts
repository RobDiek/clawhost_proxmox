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
    uuid,
    bigserial,
    bigint,
    date
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
    // Phase 1.5 — admin-only toggle. When TRUE, user gets full self-service
    // tenant management (create/edit/delete/assign tenants from their own
    // dashboard) + MIFKADA orchestrator visibility. When FALSE (default),
    // legacy single-tenant flow; tenants UI hidden.
    agencyModeEnabled: boolean('agency_mode_enabled').notNull().default(false),
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

// ─── Tenants — Phase 1 multi-tenant layer (between User and Instance) ─────
// Supports agencies managing multiple clients on a single VPS (Sergei's
// master case: Flowmatic + ClientA's 3 MATEH all under one user but
// different tenants). Also is the scope unit for the MIFKADA orchestrator
// (Phase 2).
export const tenants = pgTable(
    'tenants',
    {
        id: text('id').primaryKey(),
        // The User who OWNS / MANAGES this tenant. For sergei master:
        //   - "Flowmatic" tenant: managedByUserId = sergei
        //   - "ClientA" tenant: managedByUserId = sergei (managed-for)
        managedByUserId: text('managed_by_user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        description: text('description'),
        // 'own' = managing user's own brand portfolio
        // 'managed' = a client of the managing user (agency case)
        kind: text('kind').notNull().default('own'),
        // Tenant-level default Anthropic key. Resolution chain at runtime:
        //   instance.aiProviderKey → tenant.defaultAnthropicKey → null
        // Per-instance override always wins.
        defaultAnthropicKey: text('default_anthropic_key'),
        defaultOpenaiKey: text('default_openai_key'),
        // Phase 2 — MIFKADA orchestrator scope flags.
        mifkadaEnabled: boolean('mifkada_enabled').notNull().default(false),
        // 'tenant' = MIFKADA only sees this tenant's instances
        // 'vps' = MIFKADA can see all tenants on same VPS (admin-gated)
        mifkadaScope: text('mifkada_scope').notNull().default('tenant'),
        isActive: boolean('is_active').notNull().default(true),
        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => [
        index('tenants_managed_by_idx').on(table.managedByUserId),
        index('tenants_active_idx').on(table.isActive),
    ],
)

export const instances = pgTable(
    'instances',
    {
        id: text('id').primaryKey(),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        // Phase 1 — tenant assignment. Nullable for legacy instances during
        // backfill window; resolved code should treat null as "default
        // tenant" via the resolveTenantId helper.
        tenantId: text('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),

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

        // Welcome email — idempotency stamp (prevents duplicate sends on
        // retry of /install-complete callback). NULL → not sent yet.
        welcomeEmailSentAt: timestamp('welcome_email_sent_at', { withTimezone: true }),

        // Admin marker — instances tagged as our own canary/master, used
        // to test stack upgrades before pushing to other clients.
        isMaster: boolean('is_master').default(false),

        // Research (for MATEH)
        researchData: jsonb('research_data'),

        // Custom subdomain (e.g. "sergei" -> sergei.clawflow.flowmatic.co.il)
        subdomainName: text('subdomain_name').unique(),

        // AI Provider keys (user's own keys)
        aiProviderKey: text('ai_provider_key'),     // Anthropic key
        aiProviderType: text('ai_provider_type'),   // 'anthropic' | 'openai'
        openaiApiKey: text('openai_api_key'),       // OpenAI key (separate, both can coexist)

        // Creative generation BYOK (Phase B2)
        falApiKey: text('fal_api_key'),              // fal.ai key for image/video generation
        elevenlabsApiKey: text('elevenlabs_api_key'),// ElevenLabs key for Hebrew TTS

        // Sub-agent model configuration (from dashboard selector)
        subAgentModels: jsonb('sub_agent_models'),  // { sayer: "anthropic/claude-opus-4-6", ... }

        // Google Workspace OAuth tokens
        googleTokens: jsonb('google_tokens'),       // { accessToken, refreshToken, expiresAt, scopes[], email }
        metaTokens: jsonb('meta_tokens'),             // { appId, appSecret, userAccessToken, pageAccessToken, pageId, instagramAccountId, adAccountId }
        microsoftTokens: jsonb('microsoft_tokens'),   // { accessToken, refreshToken, expiresAt, scopes[], email }

        // SEO/AEO integrations
        gscTokens: jsonb('gsc_tokens'),               // { accessToken, refreshToken, expiresAt, email, siteUrl, sites[] }
        // DataForSEO: legacy direct-key field. Used only when dfsUseProxy=false (advanced mode).
        // Default flow uses Flowmatic-managed proxy with per-tenant USD balance.
        dataforseoKey: text('dataforseo_key'),         // legacy: tenant's own DFS login:password
        dataforseoKeyLegacy: text('dataforseo_key_legacy'),  // backup of pre-migration key
        firecrawlKey: text('firecrawl_key'),           // Firecrawl API key

        // ── DataForSEO proxy + credits (Phase 3.6) ──
        // Source-of-truth balance, atomically debited per DFS call.
        dfsBalanceUsdCents:               integer('dfs_balance_usd_cents').default(0).notNull(),
        // Default true. False = use legacy dataforseoKey direct (escape hatch for power users).
        dfsUseProxy:                      boolean('dfs_use_proxy').default(true).notNull(),
        // Auto-topup: when balance < threshold, charge stored AllPay token for amount.
        dfsAutoTopupThresholdUsdCents:    integer('dfs_auto_topup_threshold_usd_cents'),
        dfsAutoTopupAmountUsdCents:       integer('dfs_auto_topup_amount_usd_cents'),
        // Hard cap: refuse calls when this month's debit sum exceeds.
        dfsMonthlyCapUsdCents:            integer('dfs_monthly_cap_usd_cents'),
        // AllPay tokenized payment method for recurring auto-topup charges.
        dfsAllpayPaymentToken:            text('dfs_allpay_payment_token'),

        // GitHub (content publishing)
        githubConfig: jsonb('github_config'),           // { token, repo, branch, contentPath }

        // Google Ads — self vs managed mode
        // self: user's own OAuth + Developer Token + Customer ID
        // managed: Flowmatic MCC + our env creds + auto-created sub-account (HaaS Silver/Gold)
        googleAdsMode: text('google_ads_mode').default('self'),  // 'self' | 'managed'
        googleAdsConfig: jsonb('google_ads_config'),    // { customerId, developerToken?, linkedAt?, mccSubAccountId? }

        // HaaS subscription tier (optional — drives ads mode + support level)
        // null              = no HaaS row chosen yet
        // 'self_service'    = infra only, no human help; uses underlying VPS plan price
        // 'configuration'   = ₪1,750 one-time, full setup, then customer self-manages
        // 'autopilot'       = ₪1,750 setup + ₪1,500/mo (min 6 months); we run everything
        haasTier: text('haas_tier'),

        // Schedules (managed by dashboard, synced to HEARTBEAT.md on VPS)
        schedules: jsonb('schedules'),                 // { core: {...}, seo: {...}, ... }

        // Telegram
        telegramChatId: text('telegram_chat_id'),
        telegramBotToken: text('telegram_bot_token'),
        // Secret token Telegram echoes back on every webhook call so we can
        // verify the request genuinely came from Telegram (not a rando).
        telegramWebhookSecret: text('telegram_webhook_secret'),

        // Referral / Trial
        freeUntil: timestamp('free_until', { withTimezone: true }),
        trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),

        // Self-Healing
        lastHealthReport: jsonb('last_health_report'),
        lastHealthAt: timestamp('last_health_at', { withTimezone: true }),
        autoHeal: boolean('auto_heal').default(true),

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

// ─── Mateh Agents — Phase 2.1 multi-MATEH-per-VPS layer ───────────────────
// Each row is one running agent (MATEH / OpenClaw / bare) on a VPS.
// `vps_instance_id` FKs to `instances` (the VPS host); a single VPS can host
// multiple agent rows. `tenant_id` FKs to `tenants` — different agents on
// the same VPS can belong to different tenants (agency case).
//
// During Phase 2.1-2.3 migration, both data layers coexist:
//   - instances.* fields still hold per-agent data for the PRIMARY agent
//     (is_primary=TRUE row in mateh_agents references the same data).
//   - Secondary agents have data ONLY in mateh_agents.
//   - New code paths read from mateh_agents; legacy paths still read from
//     instances. After Phase 2.3 the duplicate fields on instances are
//     deprecated.
export const matehAgents = pgTable(
    'mateh_agents',
    {
        id: text('id').primaryKey(),
        vpsInstanceId: text('vps_instance_id')
            .notNull()
            .references(() => instances.id, { onDelete: 'cascade' }),
        tenantId: text('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
        agentType: text('agent_type').notNull().default('mateh'),
        name: text('name').notNull(),
        brandSlug: text('brand_slug').notNull(),
        subdomainAgent: text('subdomain_agent'),
        subdomainFlows: text('subdomain_flows'),
        gatewayPort: integer('gateway_port'),
        openclawToken: text('openclaw_token'),
        automationPassword: text('automation_password'),
        aiProviderKey: text('ai_provider_key'),
        aiProviderType: text('ai_provider_type'),
        openaiApiKey: text('openai_api_key'),
        falApiKey: text('fal_api_key'),
        elevenlabsApiKey: text('elevenlabs_api_key'),
        dataforseoKey: text('dataforseo_key'),
        firecrawlKey: text('firecrawl_key'),
        subAgentModels: jsonb('sub_agent_models'),
        googleTokens: jsonb('google_tokens'),
        metaTokens: jsonb('meta_tokens'),
        microsoftTokens: jsonb('microsoft_tokens'),
        gscTokens: jsonb('gsc_tokens'),
        githubConfig: jsonb('github_config'),
        telegramChatId: text('telegram_chat_id'),
        telegramBotToken: text('telegram_bot_token'),
        telegramWebhookSecret: text('telegram_webhook_secret'),
        researchData: jsonb('research_data'),
        onboardingStep: integer('onboarding_step').notNull().default(0),
        onboardingCompleted: boolean('onboarding_completed').notNull().default(false),
        schedules: jsonb('schedules'),
        status: text('status').notNull().default('provisioning'),
        lastHealthReport: jsonb('last_health_report'),
        lastHealthAt: timestamp('last_health_at', { withTimezone: true }),
        autoHeal: boolean('auto_heal').notNull().default(true),
        isPrimary: boolean('is_primary').notNull().default(false),
        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => [
        index('mateh_agents_vps_idx').on(table.vpsInstanceId),
        index('mateh_agents_tenant_idx').on(table.tenantId),
        index('mateh_agents_status_idx').on(table.status),
    ],
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

// ── Agent Integrations (per-agent isolation) ──
export const agentIntegrations = pgTable(
    'agent_integrations',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        instanceId: text('instance_id')
            .notNull()
            .references(() => instances.id, { onDelete: 'cascade' }),
        // Phase 2.3.D — mateh_agent.id this integration belongs to. Replaces
        // the agentType-based unique constraint (which collapsed multiple
        // secondary mateh_agents both stored as 'mt' into one row).
        agentId: text('agent_id').references(() => matehAgents.id, { onDelete: 'set null' }),
        agentType: text('agent_type').notNull(),          // 'oc' | 'mt' | 'bare' (legacy; kept for filter compatibility)
        integrationType: text('integration_type').notNull(), // 'telegram' | 'google' | 'meta' | 'microsoft' | 'whatsapp' | 'gbp' | 'api_key'
        config: jsonb('config').notNull().default({}),    // integration-specific config (tokens, keys, etc.)
        status: text('status').notNull().default('connected'), // 'connected' | 'disconnected' | 'pending'
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        index('agent_int_instance_idx').on(table.instanceId),
        index('agent_int_agent_idx').on(table.instanceId, table.agentType),
        index('agent_integrations_agent_idx').on(table.agentId),
        unique('agent_int_unique').on(table.instanceId, table.agentId, table.integrationType),
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
        // Phase 2.3.C — which mateh_agent this output belongs to. Nullable
        // because legacy callers pre-2.3.C didn't have a per-agent context;
        // backfill assigns those to the VPS's primary agent. New code MUST
        // set this on insert so secondary-agent queues stay isolated.
        agentId: text('agent_id').references(() => matehAgents.id, { onDelete: 'set null' }),

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
        index('agent_outputs_scheduled_idx').on(table.instanceId, table.scheduledFor),
        index('agent_outputs_agent_idx').on(table.agentId),
    ]
)

// ── Brand Books (per-instance visual + voice identity) ──
// Fed into Yotzer creative pipeline (Gates 1-4) + ayat copy agent.
// Versioned: one row per major update. Only one 'approved' row per instance at a time.
export const brandBooks = pgTable(
    'brand_books',
    {
        id: text('id').primaryKey(),
        instanceId: text('instance_id').notNull().references(() => instances.id, { onDelete: 'cascade' }),
        // Phase 2.3.D — per-agent isolation
        agentId: text('agent_id').references(() => matehAgents.id, { onDelete: 'set null' }),
        version: integer('version').notNull().default(1),
        status: text('status').notNull().default('draft'),
        // draft | pending_approval | approved | archived | locked
        source: text('source').notNull().default('extracted'),
        // extracted | generated | uploaded | mixed

        // Identity
        businessName: text('business_name'),
        legalName: text('legal_name'),
        taglineHe: text('tagline_he'),
        taglineEn: text('tagline_en'),
        missionHe: text('mission_he'),
        missionEn: text('mission_en'),
        manifestoHe: text('manifesto_he'),
        positioningLine: text('positioning_line'),

        // Visual identity (jsonb for schema evolution)
        logo: jsonb('logo'),
        colors: jsonb('colors'),
        typography: jsonb('typography'),
        imagery: jsonb('imagery'),
        voice: jsonb('voice'),
        components: jsonb('components'),
        compliance: jsonb('compliance'),
        principles: jsonb('principles'),  // brand constitution rules

        // Composer output — reasoning + confidence (Tier 1-D + Tier 2-O/T)
        rationaleHe: text('rationale_he'),             // legacy flat text (backcompat)
        rationaleJson: jsonb('rationale_json'),         // { overall, colors, typography, voice, identity }
        confidence: text('confidence'),                 // 'high' | 'medium' | 'low'
        confidenceReasons: jsonb('confidence_reasons'), // string[] — why this confidence level
        hebrewCorrections: jsonb('hebrew_corrections'), // validator audit trail

        // PDF export
        pdfUrl: text('pdf_url'),
        pdfGeneratedAt: timestamp('pdf_generated_at', { withTimezone: true }),

        // Gaps (drives UI prompts for missing fields)
        gaps: jsonb('gaps'),

        // Scraping source metadata
        sourceUrl: text('source_url'),
        sourceScrapedAt: timestamp('source_scraped_at', { withTimezone: true }),
        sourceRaw: jsonb('source_raw'),

        // Workflow
        approvedAt: timestamp('approved_at', { withTimezone: true }),
        approvedBy: text('approved_by'),
        lockedUntil: timestamp('locked_until', { withTimezone: true }),

        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        index('brand_books_instance_idx').on(table.instanceId),
        index('brand_books_status_idx').on(table.instanceId, table.status),
        index('brand_books_agent_idx').on(table.agentId),
        unique('brand_books_instance_agent_version_uniq').on(table.instanceId, table.agentId, table.version),
    ]
)

// ── Creative Renders (Phase B2) — every approved creative spawns a render attempt ──
export const creativeRenders = pgTable(
    'creative_renders',
    {
        id: text('id').primaryKey(),
        instanceId: text('instance_id').notNull().references(() => instances.id, { onDelete: 'cascade' }),
        // Phase 2.3.D — per-agent isolation
        agentId: text('agent_id').references(() => matehAgents.id, { onDelete: 'set null' }),
        outputId: text('output_id').references(() => agentOutputs.id, { onDelete: 'set null' }),

        // Lifecycle
        renderStatus: text('render_status').notNull().default('queued'),
        // queued → rendering → uploading → compositing → done | failed
        queuedAt: timestamp('queued_at', { withTimezone: true }).defaultNow().notNull(),
        startedAt: timestamp('started_at', { withTimezone: true }),
        completedAt: timestamp('completed_at', { withTimezone: true }),
        durationSec: integer('duration_sec'),
        errorMessage: text('error_message'),

        // Request
        tier: text('tier').notNull(),
        formatType: text('format_type').notNull(),
        selectedModel: text('selected_model').notNull(),
        falRequestId: text('fal_request_id'),

        // Lineage
        conceptId: text('concept_id'),
        characterRefId: text('character_ref_id'),
        scenesId: text('scenes_id'),
        brandBookVersion: integer('brand_book_version'),

        // Prompts (exact strings — reproducibility + learning)
        prompts: jsonb('prompts'),

        // Output
        resultUrls: jsonb('result_urls'),
        finalUrl: text('final_url'),
        thumbnailUrl: text('thumbnail_url'),
        fileSizeBytes: integer('file_size_bytes'),
        dimensions: jsonb('dimensions'),

        // Composition metadata
        overlayApplied: boolean('overlay_applied').default(false),
        logoApplied: boolean('logo_applied').default(false),
        audioApplied: boolean('audio_applied').default(false),
        upscaleApplied: boolean('upscale_applied').default(false),
        subtitlesApplied: boolean('subtitles_applied').default(false),

        // Cost
        estimatedCostUsd: decimal('estimated_cost_usd', { precision: 10, scale: 4 }),
        actualCostUsd: decimal('actual_cost_usd', { precision: 10, scale: 4 }),

        // Learning signals
        userRating: integer('user_rating'),   // 1-5
        userFeedback: text('user_feedback'),

        // Phase B4 — Auto-Quality Pipeline
        qualityScore: decimal('quality_score', { precision: 4, scale: 2 }),        // 0-10
        qualityDecision: text('quality_decision'),                                   // auto_reject | low_confidence | high_confidence
        qualityChecks: jsonb('quality_checks'),                                      // CheckResult[]
        qualityCriticalFails: jsonb('quality_critical_fails'),                       // string[]
        qualityRegenCritique: text('quality_regen_critique'),
        qualityCheckCostUsd: decimal('quality_check_cost_usd', { precision: 10, scale: 4 }),
        regenCount: integer('regen_count').default(0),
        parentRenderId: text('parent_render_id'),

        // Phase B6 — A/B hypothesis link
        hypothesisId: text('hypothesis_id'),
        variantLabel: text('variant_label'),

        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        index('creative_renders_instance_idx').on(table.instanceId),
        index('creative_renders_status_idx').on(table.instanceId, table.renderStatus),
        index('creative_renders_output_idx').on(table.outputId),
        index('creative_renders_agent_idx').on(table.agentId),
    ]
)

// ── Content Plan Media (Phase M) — organic content renders ──
// Separate from creativeRenders (which is for Ads with its B4 quality loop).
// Every plan item gets 1-N media renders (one per channel variant). Files
// live on the CLIENT VPS at /home/openclaw/.openclaw/media/... and are served
// via nginx at https://agent.{id}.clawflow.flowmatic.co.il/media/...
export const contentPlanMedia = pgTable(
    'content_plan_media',
    {
        id: text('id').primaryKey(),                         // cpm_<hex>
        instanceId: text('instance_id').notNull().references(() => instances.id, { onDelete: 'cascade' }),
        // Phase 2.3.D — per-agent isolation
        agentId: text('agent_id').references(() => matehAgents.id, { onDelete: 'set null' }),
        contentPlanItemId: text('content_plan_item_id').notNull(), // "cp_..." key in researchData.contentPlan
        outputId: text('output_id').references(() => agentOutputs.id, { onDelete: 'set null' }),

        // What
        renderType: text('render_type').notNull(),           // 'image' | 'video' | 'voice' | 'composite'
        channel: text('channel').notNull(),                  // 'instagram' | 'facebook' | 'blog' | ...
        formatSpec: jsonb('format_spec'),                     // { width, height, aspectRatio, durationSec }

        // How (generation)
        model: text('model').notNull(),                      // 'flux-pro-1.1' | 'kling-1.6' | 'elevenlabs-v2'
        prompt: text('prompt').notNull(),
        negativePrompt: text('negative_prompt'),
        seed: integer('seed'),
        brandSnapshot: jsonb('brand_snapshot'),               // brand book state at render time
        styleAnchor: text('style_anchor'),

        // Where (storage on client VPS)
        vpsPath: text('vps_path'),                           // /home/openclaw/.openclaw/media/...
        publicUrl: text('public_url'),                        // https URL for FB/IG/etc
        thumbnailUrl: text('thumbnail_url'),
        fileSizeBytes: integer('file_size_bytes'),

        // Versioning (iterations on same plan item)
        version: integer('version').default(1).notNull(),
        parentId: text('parent_id'),                          // previous render in iteration chain

        // Review workflow
        status: text('status').notNull().default('queued'),
        // queued → generating → uploading_to_vps → ready → approved | rejected | failed
        rejectionReason: text('rejection_reason'),
        userPromptEdit: text('user_prompt_edit'),             // natural-lang change user asked for

        // Brand consistency score
        brandScore: integer('brand_score'),                   // 0-100
        brandScoreBreakdown: jsonb('brand_score_breakdown'),   // { colorMatch, logoPresence, styleMatch }

        // Cost
        costUsd: decimal('cost_usd', { precision: 8, scale: 4 }),

        // Scenario — which creative recipe produced this render
        // (e.g., 'ad-hero-flux', 'ad-typography-nano', 'story-reel-vertical').
        // Drives the optimization report: "ad-typography-nano ROI 2.3× higher
        // than ad-hero-flux — consider switching default for this segment."
        scenario: text('scenario'),

        // Timestamps
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        generatedAt: timestamp('generated_at', { withTimezone: true }),
        approvedAt: timestamp('approved_at', { withTimezone: true }),
        approvedBy: text('approved_by'),
    },
    (table) => [
        index('cpm_instance_idx').on(table.instanceId),
        index('cpm_item_idx').on(table.contentPlanItemId),
        index('cpm_status_idx').on(table.instanceId, table.status),
        index('cpm_scenario_idx').on(table.instanceId, table.scenario),
        index('content_plan_media_agent_idx').on(table.agentId),
    ]
)

// ── Creative References (Phase B3) — mined competitor ads + DNA tags ──
export const creativeReferences = pgTable(
    'creative_references',
    {
        id: text('id').primaryKey(),
        instanceId: text('instance_id').notNull().references(() => instances.id, { onDelete: 'cascade' }),
        // Phase 2.3.D — per-agent isolation
        agentId: text('agent_id').references(() => matehAgents.id, { onDelete: 'set null' }),

        source: text('source').notNull(),       // 'meta_ad_library' | 'user_upload' | 'our_winner' | ...
        sourceId: text('source_id'),
        sourceUrl: text('source_url'),

        competitorName: text('competitor_name'),
        country: text('country').default('IL'),
        firstSeenAt: timestamp('first_seen_at', { withTimezone: true }),
        lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
        daysActive: integer('days_active'),
        variationCount: integer('variation_count'),
        spendRangeMin: integer('spend_range_min'),
        spendRangeMax: integer('spend_range_max'),
        impressionsMin: integer('impressions_min'),
        impressionsMax: integer('impressions_max'),

        headline: text('headline'),
        bodyText: text('body_text'),
        ctaText: text('cta_text'),
        imageUrl: text('image_url'),
        videoThumbUrl: text('video_thumb_url'),
        platforms: text('platforms').array().default([]),

        dna: jsonb('dna'),
        dnaComputedAt: timestamp('dna_computed_at', { withTimezone: true }),

        signalScore: decimal('signal_score', { precision: 10, scale: 2 }),

        usedInDrafts: jsonb('used_in_drafts').default([]),

        isActive: boolean('is_active').default(true),
        lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),

        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        index('creative_refs_instance_idx').on(table.instanceId),
        index('creative_refs_signal_idx').on(table.instanceId, table.signalScore),
        index('creative_references_agent_idx').on(table.agentId),
    ]
)

// ── Phase B5 — Creative Performance (time-series) ──
export const creativePerformance = pgTable(
    'creative_performance',
    {
        id: text('id').primaryKey(),
        instanceId: text('instance_id').notNull().references(() => instances.id, { onDelete: 'cascade' }),
        renderId: text('render_id').notNull().references(() => creativeRenders.id, { onDelete: 'cascade' }),

        platform: text('platform').notNull(),           // 'meta' | 'google_ads' | 'tiktok' | 'linkedin'
        platformCreativeId: text('platform_creative_id').notNull(),
        measurementDate: text('measurement_date').notNull(),   // ISO date string YYYY-MM-DD
        measurementWindow: text('measurement_window').notNull().default('daily'),

        spend: decimal('spend', { precision: 12, scale: 4 }).default('0'),
        impressions: integer('impressions').default(0),   // bigint in SQL; int fits <2B ok
        clicks: integer('clicks').default(0),
        reach: integer('reach').default(0),
        frequency: decimal('frequency', { precision: 6, scale: 3 }),
        ctr: decimal('ctr', { precision: 8, scale: 5 }),
        cpc: decimal('cpc', { precision: 12, scale: 4 }),
        cpm: decimal('cpm', { precision: 12, scale: 4 }),
        currency: text('currency').default('ILS'),

        videoPlays: integer('video_plays').default(0),
        videoP25: integer('video_p25').default(0),
        videoP50: integer('video_p50').default(0),
        videoP75: integer('video_p75').default(0),
        videoP100: integer('video_p100').default(0),
        hookRate: decimal('hook_rate', { precision: 8, scale: 5 }),
        holdRate: decimal('hold_rate', { precision: 8, scale: 5 }),

        conversions: decimal('conversions', { precision: 12, scale: 2 }).default('0'),
        conversionValue: decimal('conversion_value', { precision: 12, scale: 4 }).default('0'),
        roas: decimal('roas', { precision: 10, scale: 4 }),

        raw: jsonb('raw'),

        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        unique('creative_performance_day_uniq').on(
            table.renderId, table.platform, table.platformCreativeId,
            table.measurementDate, table.measurementWindow,
        ),
        index('creative_performance_instance_idx').on(table.instanceId, table.measurementDate),
        index('creative_performance_render_idx').on(table.renderId, table.measurementDate),
    ]
)

export const platformCreativeMappings = pgTable(
    'platform_creative_mappings',
    {
        id: text('id').primaryKey(),
        instanceId: text('instance_id').notNull().references(() => instances.id, { onDelete: 'cascade' }),
        renderId: text('render_id').notNull().references(() => creativeRenders.id, { onDelete: 'cascade' }),

        platform: text('platform').notNull(),
        platformCreativeId: text('platform_creative_id').notNull(),
        platformCampaignId: text('platform_campaign_id'),
        platformAccountId: text('platform_account_id').notNull(),

        publishedAt: timestamp('published_at', { withTimezone: true }),
        publishedBy: text('published_by'),
        notes: text('notes'),

        isActive: boolean('is_active').default(true),
        lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
        lastSyncError: text('last_sync_error'),

        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        unique('platform_creative_mappings_uniq').on(table.instanceId, table.platform, table.platformCreativeId),
        index('platform_creative_mappings_render_idx').on(table.renderId),
    ]
)

// ── Phase B6 — Creative A/B Hypotheses ──
export const creativeHypotheses = pgTable(
    'creative_hypotheses',
    {
        id: text('id').primaryKey(),
        instanceId: text('instance_id').notNull().references(() => instances.id, { onDelete: 'cascade' }),
        // Phase 2.3.D — per-agent isolation
        agentId: text('agent_id').references(() => matehAgents.id, { onDelete: 'set null' }),

        statement: text('statement').notNull(),
        reasoning: text('reasoning'),
        primaryMetric: text('primary_metric').notNull(),         // ctr | roas | hook_rate | conversion_rate
        successDirection: text('success_direction').notNull().default('higher'),

        variants: jsonb('variants').notNull().default([]),        // [{renderId, label, predictedLift, launchedAt}]
        controlRenderId: text('control_render_id'),

        minSpendIls: decimal('min_spend_ils', { precision: 10, scale: 2 }).default('200'),
        minDaysRunning: integer('min_days_running').default(7),
        maxVariants: integer('max_variants').default(4),

        preRegisteredAt: timestamp('pre_registered_at', { withTimezone: true }),
        registeredBy: text('registered_by'),

        status: text('status').notNull().default('draft'),
        // draft | pre_registered | running | concluded | inconclusive | abandoned

        concludedAt: timestamp('concluded_at', { withTimezone: true }),
        winnerRenderId: text('winner_render_id'),
        loserRenderIds: text('loser_render_ids').array().default([]),
        posteriorProbability: decimal('posterior_probability', { precision: 5, scale: 4 }),
        metricLiftPct: decimal('metric_lift_pct', { precision: 8, scale: 3 }),
        analysis: jsonb('analysis'),
        insightHe: text('insight_he'),
        insightEn: text('insight_en'),
        savedAsFact: jsonb('saved_as_fact'),

        abandonedReason: text('abandoned_reason'),

        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        index('creative_hypotheses_instance_idx').on(table.instanceId, table.status),
        index('creative_hypotheses_agent_idx').on(table.agentId),
    ]
)

export const creativeFatigueAlerts = pgTable(
    'creative_fatigue_alerts',
    {
        id: text('id').primaryKey(),
        instanceId: text('instance_id').notNull().references(() => instances.id, { onDelete: 'cascade' }),
        // Phase 2.3.D — per-agent isolation
        agentId: text('agent_id').references(() => matehAgents.id, { onDelete: 'set null' }),
        renderId: text('render_id').notNull().references(() => creativeRenders.id, { onDelete: 'cascade' }),

        triggerReason: text('trigger_reason').notNull(),
        triggerValue: decimal('trigger_value', { precision: 10, scale: 3 }),
        triggerThreshold: decimal('trigger_threshold', { precision: 10, scale: 3 }),
        baselineValue: decimal('baseline_value', { precision: 10, scale: 3 }),

        detectedAt: timestamp('detected_at', { withTimezone: true }).defaultNow().notNull(),
        status: text('status').notNull().default('open'),
        refreshRenderId: text('refresh_render_id'),
        dismissedReason: text('dismissed_reason'),

        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        index('creative_fatigue_alerts_instance_idx').on(table.instanceId, table.status),
        index('creative_fatigue_alerts_agent_idx').on(table.agentId),
    ]
)

// ── WhatsApp Business ──
export const waConfig = pgTable('wa_config', {
    instanceId: text('instance_id').primaryKey().references(() => instances.id),
    greenApiInstance: text('green_api_instance'),
    greenApiToken: text('green_api_token'),
    businessPhone: text('business_phone'),
    optinMethod: text('optin_method').default('incoming'),  // incoming|website|manual
    autoReplyText: text('auto_reply_text').default('ברוכים הבאים! תקבלו עדכונים מאיתנו 🎉'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
})

export const waContacts = pgTable('wa_contacts', {
    id: uuid('id').primaryKey().defaultRandom(),
    instanceId: text('instance_id').references(() => instances.id).notNull(),
    phone: text('phone').notNull(),
    name: text('name'),
    optedIn: boolean('opted_in').default(false),
    optedInAt: timestamp('opted_in_at', { withTimezone: true }),
    optedInMethod: text('opted_in_method'),  // incoming|website|manual
    optedOut: boolean('opted_out').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [
    unique('wa_contacts_instance_phone').on(table.instanceId, table.phone),
    index('wa_contacts_instance_idx').on(table.instanceId)
])

export const waTemplates = pgTable('wa_templates', {
    id: uuid('id').primaryKey().defaultRandom(),
    instanceId: text('instance_id').references(() => instances.id).notNull(),
    templateName: text('template_name').notNull(),  // snake_case, latin only
    category: text('category').notNull(),  // MARKETING|UTILITY
    language: text('language').default('he'),
    bodyText: text('body_text'),
    header: text('header'),
    footer: text('footer'),
    variables: jsonb('variables'),  // ["{{1}}", "{{2}}"]
    greenApiTemplateId: text('green_api_template_id'),
    status: text('status').default('draft'),  // draft|submitted|approved|rejected
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [
    index('wa_templates_instance_idx').on(table.instanceId)
])

export const waSends = pgTable('wa_sends', {
    id: uuid('id').primaryKey().defaultRandom(),
    instanceId: text('instance_id').references(() => instances.id).notNull(),
    templateId: uuid('template_id').references(() => waTemplates.id),
    totalRecipients: integer('total_recipients').default(0),
    sentCount: integer('sent_count').default(0),
    deliveredCount: integer('delivered_count').default(0),
    readCount: integer('read_count').default(0),
    status: text('status').default('queued'),  // queued|sending|completed|failed
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [
    index('wa_sends_instance_idx').on(table.instanceId)
])

// ── Referral Program ──
export const referrals = pgTable('referrals', {
    id: uuid('id').primaryKey().defaultRandom(),
    referrerUserId: text('referrer_user_id').notNull(),
    referralCode: text('referral_code').unique().notNull(),
    refereeEmail: text('referee_email'),
    refereeUserId: text('referee_user_id'),
    status: text('status').default('pending'),  // pending|trial_started|converted|expired
    trialInstanceId: text('trial_instance_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    trialStartedAt: timestamp('trial_started_at', { withTimezone: true }),
    convertedAt: timestamp('converted_at', { withTimezone: true }),
    rewardedAt: timestamp('rewarded_at', { withTimezone: true }),
}, (table) => [
    index('referrals_referrer_idx').on(table.referrerUserId),
    index('referrals_code_idx').on(table.referralCode),
])

// ── Knowledge Base (pgvector RAG) ──
export const knowledgeDocuments = pgTable(
    'knowledge_documents',
    {
        id: text('id').primaryKey(),
        instanceId: text('instance_id')
            .notNull()
            .references(() => instances.id, { onDelete: 'cascade' }),
        // Phase 2.3.D — per-agent isolation
        agentId: text('agent_id').references(() => matehAgents.id, { onDelete: 'set null' }),
        filename: text('filename').notNull(),
        contentType: text('content_type').notNull(), // 'text/plain', 'text/markdown', 'application/pdf', 'text/csv'
        rawContent: text('raw_content'),             // original text (truncated to 50k chars)
        chunkCount: integer('chunk_count').default(0),
        status: text('status').notNull().default('processing'), // processing | ready | failed
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        index('knowledge_docs_instance_idx').on(table.instanceId),
        index('knowledge_documents_agent_idx').on(table.agentId),
    ]
)

export const knowledgeChunks = pgTable(
    'knowledge_chunks',
    {
        id: text('id').primaryKey(),
        documentId: text('document_id')
            .notNull()
            .references(() => knowledgeDocuments.id, { onDelete: 'cascade' }),
        instanceId: text('instance_id')
            .notNull()
            .references(() => instances.id, { onDelete: 'cascade' }),
        // Phase 2.3.D — per-agent isolation
        agentId: text('agent_id').references(() => matehAgents.id, { onDelete: 'set null' }),
        chunkIndex: integer('chunk_index').notNull(),
        content: text('content').notNull(),
        // embedding vector stored as jsonb (float array) — pgvector extension query done via raw SQL
        embedding: jsonb('embedding').$type<number[]>(),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        index('knowledge_chunks_instance_idx').on(table.instanceId),
        index('knowledge_chunks_doc_idx').on(table.documentId),
        index('knowledge_chunks_agent_idx').on(table.agentId),
    ]
)

// ── Strategy Lab (Phase G) — weekly auto-extracted learnings per tenant ──
// Each row answers: "within dimension X, which value wins / loses for this
// tenant, based on last 28d of creative performance?" Fed back into content
// plan generation so the plan steers toward observed winners.
export const strategyLearnings = pgTable('strategy_learnings', {
    id: text('id').primaryKey(),
    instanceId: text('instance_id').notNull().references(() => instances.id, { onDelete: 'cascade' }),
    // Phase 2.3.D — per-agent isolation
    agentId: text('agent_id').references(() => matehAgents.id, { onDelete: 'set null' }),
    dimension: text('dimension').notNull(),          // channel | format | pillar | persona | hook_pattern | paid_organic
    winnerValue: text('winner_value').notNull(),
    loserValue: text('loser_value'),
    metric: text('metric').notNull(),                // roas | leads | ctr | engagement_rate | conversion_rate
    winnerScore: decimal('winner_score', { precision: 14, scale: 4 }),
    loserScore: decimal('loser_score', { precision: 14, scale: 4 }),
    effectSize: decimal('effect_size', { precision: 10, scale: 3 }),
    dataPointsCount: integer('data_points_count').notNull(),
    confidence: text('confidence').notNull().default('low'),  // high | medium | low
    measuredSince: timestamp('measured_since', { withTimezone: true }).notNull(),
    measuredUntil: timestamp('measured_until', { withTimezone: true }).notNull(),
    recommendation: text('recommendation'),
    breakdown: jsonb('breakdown'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index('sl_instance_dim_idx').on(table.instanceId, table.dimension, table.createdAt),
    index('sl_instance_recent_idx').on(table.instanceId, table.measuredUntil),
    index('strategy_learnings_agent_idx').on(table.agentId),
])

// ── Google Business Profile ──
export const gbpConfig = pgTable('gbp_config', {
    instanceId: text('instance_id').primaryKey().references(() => instances.id),
    accountId: text('account_id'),         // GBP account ID
    locationId: text('location_id'),       // GBP location ID
    businessName: text('business_name'),
    autoRepost: boolean('auto_repost').default(true),
    reviewCheckFrequency: text('review_check_frequency').default('weekly'),  // daily|weekly
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
})

// ── Admin panel (admin.flowmatic.co.il) ──────────────────────────────────
export const adminUsers = pgTable('admin_users', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    totpSecret: text('totp_secret'),
    totpSetupCompleted: boolean('totp_setup_completed').default(false),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const adminSessions = pgTable('admin_sessions', {
    id: uuid('id').primaryKey().defaultRandom(),
    adminId: uuid('admin_id').notNull().references(() => adminUsers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const adminAudit = pgTable('admin_audit', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    adminId: uuid('admin_id').references(() => adminUsers.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    details: jsonb('details'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const adminSnapshots = pgTable('admin_snapshots', {
    id: uuid('id').primaryKey().defaultRandom(),
    instanceId: text('instance_id').notNull(),
    hetznerImageId: integer('hetzner_image_id'),
    reason: text('reason'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => adminUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// ── DataForSEO response cache (per-tenant) ────────────────────────────────
// Avoids re-paying for the same query across re-runs. TTLs vary by endpoint
// type — see services/research/dataforseo/cache.ts for the policy table.
// Per-tenant cache key keeps billing semantics clean: no tenant reads data
// another tenant paid for.
export const dfsCache = pgTable('dfs_cache', {
    cacheKey:   text('cache_key').primaryKey(),       // sha256(instanceId + endpoint + paramsHash)
    instanceId: text('instance_id').notNull(),        // owning tenant
    endpoint:   text('endpoint').notNull(),           // e.g. "labs/keyword_ideas"
    response:   jsonb('response').notNull(),          // raw DFS response payload
    cost:       text('cost'),                         // DFS-reported cost in USD (string for precision)
    expiresAt:  timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt:  timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ── DataForSEO proxy: per-tenant credit ledger ─────────────────────────────
// Phase 3.6 — Flowmatic-managed proxy with master DFS account. Tenants buy
// credits via AllPay; calls debit balance at exact DFS-reported cost. Ledger
// is the audit trail: every credit (topup/admin/refund) and debit (DFS call).
//
// Balance source-of-truth = `instances.dfs_balance_usd_cents` (atomically
// updated). Ledger is append-only history; reconstructable via SUM(amount).
export const dfsLedger = pgTable('dfs_ledger', {
    id:               bigserial('id', { mode: 'number' }).primaryKey(),
    instanceId:       text('instance_id').notNull(),
    /** 'topup' | 'debit' | 'refund' | 'admin_credit' | 'auto_topup' */
    kind:             text('kind').notNull(),
    /** Positive for credits, negative for debits. USD cents. */
    amountUsdCents:   integer('amount_usd_cents').notNull(),
    /** Exact DFS-reported cost in USD (debit only) — preserves sub-cent precision. */
    costUsdRaw:       text('cost_usd_raw'),
    /** DFS endpoint path (debit only) */
    endpoint:         text('endpoint'),
    /** dfs_cache.cache_key for deduplication-trace (debit only) */
    cacheKey:         text('cache_key'),
    /** AllPay order id (topup/auto_topup only) */
    allpayOrderId:    text('allpay_order_id'),
    /** Free-text reason for admin_credit/refund/adjustment */
    note:             text('note'),
    createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ── System config singleton ────────────────────────────────────────────────
// Single-row-per-key store for runtime-mutable config. v1 keys:
//   'usd_to_ils_rate_with_fee' — daily-pinned FX rate × 1.029 (AllPay fee buffer)
// Adding more keys is just inserts; no schema migration needed.
export const systemConfig = pgTable('system_config', {
    key:        text('key').primaryKey(),
    value:      text('value').notNull(),
    updatedAt:  timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ── Universal data ingestion (Phase 4.1 — paid track) ─────────────────────
// Every row of historical/live performance data normalized into one canonical
// shape, regardless of upstream source (Meta CSV, Google Ads CSV, GA4 export,
// GSC export, Looker PDF, OAuth pull, screenshot OCR). Layer-1 of the 4-layer
// paid architecture: Ingestion → Understanding → Hypotheses → Verification.
//
// Why one table for all sources: hypothesis engine queries cross-source
// (e.g. "campaign X had 5% CTR in Meta but 0.8% in Google Ads — why?") and
// dedup/quality scoring is uniform. Adapter-specific raw payload preserved
// in `raw` JSONB for re-mapping if a mapper bug is found later.
//
// Granularity rule: one row = one (entity_id, day) or (entity_id, period_range)
// depending on what the source provides. Mappers explode period-aggregated
// source rows into per-day rows when the source has daily breakdown; keep
// them aggregated when only totals are available.
export const ingestedDataPoints = pgTable(
    'ingested_data_points',
    {
        id:            bigserial('id', { mode: 'number' }).primaryKey(),
        instanceId:    text('instance_id')
            .notNull()
            .references(() => instances.id, { onDelete: 'cascade' }),
        agentId:       text('agent_id').references(() => matehAgents.id, { onDelete: 'set null' }),

        // ── Source provenance ─────────────────────────────────────────────
        /** What the classifier identified the upstream as. See dataIngestion/classifier.ts. */
        sourceType:    text('source_type').notNull(),
        // 'meta_ads_csv' | 'google_ads_csv' | 'ga4_export_csv' | 'gsc_export_csv'
        // | 'looker_studio_pdf' | 'screenshot_dashboard' | 'meta_ads_oauth'
        // | 'google_ads_oauth' | 'ga4_oauth' | 'gsc_oauth' | 'manual_entry' | 'generic_csv'

        /** How we got the data: 'upload' (user file), 'oauth' (live pull), 'manual'. */
        sourceMode:    text('source_mode').notNull().default('upload'),

        /** Upload file id / OAuth job id / manual entry id — for grouping a single ingestion event. */
        ingestionBatchId: text('ingestion_batch_id'),

        /** Provenance metadata: { filename, fileHash, classifierConfidence, classifierEvidence, mapperVersion }. */
        sourceMeta:    jsonb('source_meta').notNull().default({}),

        // ── What entity this row describes ────────────────────────────────
        /** 'campaign' | 'adset' | 'ad' | 'keyword' | 'page' | 'query' | 'account' | 'event' */
        dataType:      text('data_type').notNull(),

        /** Native entity id from source if available, else mapper-fabricated id from name. */
        entityId:      text('entity_id').notNull(),
        entityName:    text('entity_name'),
        /** Platform: 'meta' | 'google_ads' | 'microsoft_ads' | 'ga4' | 'gsc' | 'tiktok' | 'linkedin' | 'unknown' */
        platform:      text('platform').notNull(),

        // ── Time window ───────────────────────────────────────────────────
        /** Inclusive UTC datetime the metrics aggregate. period_start === period_end for daily rows. */
        periodStart:   timestamp('period_start', { withTimezone: true }).notNull(),
        periodEnd:     timestamp('period_end', { withTimezone: true }).notNull(),
        /** 'day' | 'week' | 'month' | 'lifetime' | 'custom' */
        periodGrain:   text('period_grain').notNull().default('day'),
        /** IANA TZ of the source account. 'Asia/Jerusalem' for IL. */
        accountTz:     text('account_tz'),
        /** Calendar day in account_tz. Populated only when the row aggregates a single day. */
        periodDateLocal: date('period_date_local'),

        // ── Attribution provenance (Phase 4.1 hardening) ──────────────────
        // Without these, cross-platform conversion sums double-count. Every
        // mapper MUST set these from source defaults if not explicit.
        /** '7d_click_1d_view' (Meta default) | '7d_click' | '28d_click_1d_view' | '30d_click' (Google default) | 'data_driven' | 'last_click' | 'unknown' */
        attributionWindow: text('attribution_window'),
        /** 'last_click' | 'first_click' | 'linear' | 'time_decay' | 'position_based' | 'data_driven' | 'unknown' */
        attributionModel:  text('attribution_model'),
        /** Event name as source reports it: 'messaging_conversation_started' | 'purchase' | 'lead' | 'all' | ... */
        conversionEventName: text('conversion_event_name'),

        // ── Normalized metrics (ILS for monetary, integer for counts) ─────
        impressions:   bigint('impressions', { mode: 'number' }),
        clicks:        bigint('clicks', { mode: 'number' }),
        /** Spend in ILS, post-FX-conversion. Source currency preserved in raw. */
        spendIls:      decimal('spend_ils', { precision: 14, scale: 4 }),
        /** Currency of the original spend before FX (USD/EUR/ILS/...). */
        sourceCurrency: text('source_currency'),
        /** FX rate applied at ingestion time (1.0 if already ILS). Audit trail. */
        fxRate:        decimal('fx_rate', { precision: 12, scale: 6 }),

        conversions:   decimal('conversions', { precision: 14, scale: 4 }),
        conversionValueIls: decimal('conversion_value_ils', { precision: 14, scale: 4 }),

        // Engagement / video
        videoViews:    bigint('video_views', { mode: 'number' }),
        engagements:   bigint('engagements', { mode: 'number' }),
        reach:         bigint('reach', { mode: 'number' }),
        frequency:     decimal('frequency', { precision: 8, scale: 4 }),

        // Search / SEO (GSC-style)
        position:      decimal('position', { precision: 8, scale: 4 }),

        // ── Dimensions (kept as JSONB so any adapter can add its own) ─────
        // E.g. { device:'mobile', placement:'instagram_reels', country:'IL',
        //       audience_label:'Lookalike 1%', match_type:'BROAD', ad_format:'video' }
        dimensions:    jsonb('dimensions').notNull().default({}),

        // ── Raw payload for re-mapping if mapper has a bug ────────────────
        raw:           jsonb('raw'),

        // ── Quality / lifecycle ───────────────────────────────────────────
        /** 0..1 composite: completeness + freshness + cross-check confidence. */
        qualityScore:  decimal('quality_score', { precision: 4, scale: 3 }).notNull().default('0.500'),
        /** Soft flags from validator: 'missing_conversions' | 'low_volume' | 'future_date' | 'currency_inferred' | 'partial_period' | etc. */
        flags:         text('flags').array().default([]),

        /** SHA-256 of (instance_id|source_type|entity_id|period_start|period_end). Dedup key — same metrics from re-uploaded file silently overwrite. */
        fingerprint:   text('fingerprint').notNull(),

        ingestedAt:    timestamp('ingested_at', { withTimezone: true }).defaultNow().notNull(),
        // Soft delete: when user removes an upload, mark rows here instead of
        // hard-delete so analyses run before deletion remain auditable.
        supersededAt:  timestamp('superseded_at', { withTimezone: true }),
    },
    (table) => [
        index('idp_instance_idx').on(table.instanceId),
        index('idp_agent_idx').on(table.agentId),
        index('idp_instance_platform_period_idx').on(table.instanceId, table.platform, table.periodStart),
        index('idp_instance_datatype_period_idx').on(table.instanceId, table.dataType, table.periodStart),
        index('idp_entity_period_idx').on(table.entityId, table.periodStart),
        index('idp_batch_idx').on(table.ingestionBatchId),
        index('idp_period_date_local_idx').on(table.instanceId, table.platform, table.periodDateLocal),
        index('idp_event_name_idx').on(table.instanceId, table.conversionEventName),
        unique('idp_fingerprint_uniq').on(table.fingerprint),
    ],
)

// ── Hypothesis Engine (Phase 4.1 Layer-3) ─────────────────────────────────
// Testable, dated, action-attached claims about a paid-track account. Full
// lifecycle proposed → approved → testing → validated/rejected/inconclusive.
// See drizzle/0055_hypotheses.sql for the design rationale.
export const hypotheses = pgTable(
    'hypotheses',
    {
        id:                       bigserial('id', { mode: 'number' }).primaryKey(),
        instanceId:               text('instance_id')
            .notNull()
            .references(() => instances.id, { onDelete: 'cascade' }),
        agentId:                  text('agent_id').references(() => matehAgents.id, { onDelete: 'set null' }),

        // Identity
        hypothesisCode:           text('hypothesis_code').notNull(),
        title:                    text('title').notNull(),
        titleHe:                  text('title_he').notNull(),

        // Scope
        scopePlatform:            text('scope_platform'),
        scopeDataType:            text('scope_data_type'),
        scopeEntityId:            text('scope_entity_id'),
        scopeEntityName:          text('scope_entity_name'),
        scopeEventName:           text('scope_event_name'),
        scopeWindowStart:         date('scope_window_start').notNull(),
        scopeWindowEnd:           date('scope_window_end').notNull(),

        // The hypothesis itself
        observation:              text('observation').notNull(),
        observationHe:            text('observation_he').notNull(),
        hypothesis:               text('hypothesis').notNull(),
        hypothesisHe:             text('hypothesis_he').notNull(),
        reasoning:                text('reasoning').notNull(),
        reasoningHe:              text('reasoning_he').notNull(),

        // Severity / actionability
        severity:                 text('severity').notNull(),
        confidence:               decimal('confidence', { precision: 4, scale: 3 }).notNull(),
        expectedImpactIls:        decimal('expected_impact_ils', { precision: 14, scale: 2 }),
        expectedImpactKind:       text('expected_impact_kind'),
        expectedImpactWindowDays: integer('expected_impact_window_days').default(30),

        // Evidence
        evidenceSnapshot:         jsonb('evidence_snapshot').notNull().default({}),
        evidenceQualityScore:     decimal('evidence_quality_score', { precision: 4, scale: 3 }),

        // Proposed action
        proposedAction:           text('proposed_action').notNull(),
        proposedActionHe:         text('proposed_action_he').notNull(),
        manualInstructions:       jsonb('manual_instructions'),
        apiActionRecipe:          jsonb('api_action_recipe'),

        // Lifecycle
        status:                   text('status').notNull().default('proposed'),
        proposedAt:               timestamp('proposed_at', { withTimezone: true }).defaultNow().notNull(),
        approvedAt:               timestamp('approved_at', { withTimezone: true }),
        approvedBy:               text('approved_by'),
        declinedAt:               timestamp('declined_at', { withTimezone: true }),
        declinedReason:           text('declined_reason'),
        testingStartedAt:         timestamp('testing_started_at', { withTimezone: true }),
        testEvaluationDueAt:      timestamp('test_evaluation_due_at', { withTimezone: true }),
        resolvedAt:               timestamp('resolved_at', { withTimezone: true }),

        // Test parameters
        testMethod:               text('test_method'),
        testWindowDays:           integer('test_window_days'),
        testSuccessCriteria:      jsonb('test_success_criteria'),

        // Outcome
        outcomeEvidenceSnapshot:  jsonb('outcome_evidence_snapshot'),
        outcomeImpactIls:         decimal('outcome_impact_ils', { precision: 14, scale: 2 }),
        outcomeSummary:           text('outcome_summary'),
        outcomeSummaryHe:         text('outcome_summary_he'),
        outcomeResolution:        text('outcome_resolution'),

        // Provenance
        source:                   text('source').notNull(),
        generatedByModel:         text('generated_by_model'),

        // Supersession
        supersededBy:             bigint('superseded_by', { mode: 'number' }),

        createdAt:                timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt:                timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        index('hypotheses_instance_status_idx').on(table.instanceId, table.status),
        index('hypotheses_agent_status_idx').on(table.agentId, table.status),
        index('hypotheses_code_idx').on(table.instanceId, table.hypothesisCode),
        index('hypotheses_scope_idx').on(table.instanceId, table.scopePlatform, table.scopeEntityId),
        index('hypotheses_eval_due_idx').on(table.testEvaluationDueAt),
        index('hypotheses_proposed_at_idx').on(table.instanceId, table.proposedAt),
    ],
)