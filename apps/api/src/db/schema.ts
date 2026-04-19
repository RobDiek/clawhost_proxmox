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
        dataforseoKey: text('dataforseo_key'),         // DataForSEO API login:password (encrypted at rest)
        firecrawlKey: text('firecrawl_key'),           // Firecrawl API key

        // GitHub (content publishing)
        githubConfig: jsonb('github_config'),           // { token, repo, branch, contentPath }

        // Google Ads — self vs managed mode
        // self: user's own OAuth + Developer Token + Customer ID
        // managed: Flowmatic MCC + our env creds + auto-created sub-account (HaaS Silver/Gold)
        googleAdsMode: text('google_ads_mode').default('self'),  // 'self' | 'managed'
        googleAdsConfig: jsonb('google_ads_config'),    // { customerId, developerToken?, linkedAt?, mccSubAccountId? }

        // HaaS subscription tier (optional — drives ads mode + support level)
        // null = no HaaS, self-service only
        // 'starter' = ₪299/mo + ₪500 setup (self-hosted ads, weekly review)
        // 'growth' = ₪699/mo + ₪1,200 setup (1 channel managed, 4 articles, 8 creatives)
        // 'autopilot' = ₪1,499/mo + ₪2,000 setup (all channels managed, 8 articles, 16 creatives, social)
        haasTier: text('haas_tier'),

        // Schedules (managed by dashboard, synced to HEARTBEAT.md on VPS)
        schedules: jsonb('schedules'),                 // { core: {...}, seo: {...}, ... }

        // Telegram
        telegramChatId: text('telegram_chat_id'),
        telegramBotToken: text('telegram_bot_token'),

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
        agentType: text('agent_type').notNull(),          // 'oc' | 'mt' | 'bare'
        integrationType: text('integration_type').notNull(), // 'telegram' | 'google' | 'meta' | 'microsoft' | 'whatsapp' | 'gbp' | 'api_key'
        config: jsonb('config').notNull().default({}),    // integration-specific config (tokens, keys, etc.)
        status: text('status').notNull().default('connected'), // 'connected' | 'disconnected' | 'pending'
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        index('agent_int_instance_idx').on(table.instanceId),
        index('agent_int_agent_idx').on(table.instanceId, table.agentType),
        unique('agent_int_unique').on(table.instanceId, table.agentType, table.integrationType),
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

// ── Brand Books (per-instance visual + voice identity) ──
// Fed into Yotzer creative pipeline (Gates 1-4) + ayat copy agent.
// Versioned: one row per major update. Only one 'approved' row per instance at a time.
export const brandBooks = pgTable(
    'brand_books',
    {
        id: text('id').primaryKey(),
        instanceId: text('instance_id').notNull().references(() => instances.id, { onDelete: 'cascade' }),
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
        unique('brand_books_instance_version_uniq').on(table.instanceId, table.version),
    ]
)

// ── Creative Renders (Phase B2) — every approved creative spawns a render attempt ──
export const creativeRenders = pgTable(
    'creative_renders',
    {
        id: text('id').primaryKey(),
        instanceId: text('instance_id').notNull().references(() => instances.id, { onDelete: 'cascade' }),
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

        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        index('creative_renders_instance_idx').on(table.instanceId),
        index('creative_renders_status_idx').on(table.instanceId, table.renderStatus),
        index('creative_renders_output_idx').on(table.outputId),
    ]
)

// ── Creative References (Phase B3) — mined competitor ads + DNA tags ──
export const creativeReferences = pgTable(
    'creative_references',
    {
        id: text('id').primaryKey(),
        instanceId: text('instance_id').notNull().references(() => instances.id, { onDelete: 'cascade' }),

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
        filename: text('filename').notNull(),
        contentType: text('content_type').notNull(), // 'text/plain', 'text/markdown', 'application/pdf', 'text/csv'
        rawContent: text('raw_content'),             // original text (truncated to 50k chars)
        chunkCount: integer('chunk_count').default(0),
        status: text('status').notNull().default('processing'), // processing | ready | failed
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        index('knowledge_docs_instance_idx').on(table.instanceId),
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
        chunkIndex: integer('chunk_index').notNull(),
        content: text('content').notNull(),
        // embedding vector stored as jsonb (float array) — pgvector extension query done via raw SQL
        embedding: jsonb('embedding').$type<number[]>(),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        index('knowledge_chunks_instance_idx').on(table.instanceId),
        index('knowledge_chunks_doc_idx').on(table.documentId),
    ]
)

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