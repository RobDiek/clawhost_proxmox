import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core'
import users from '@/db/schema/users'
import sshKeys from '@/db/schema/sshKeys'

const agents = pgTable(
    'agents',
    {
        id: text('id').primaryKey(),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        emoji: text('emoji'),
        emojiColor: text('emoji_color'),
        providerServerId: text('provider_server_id'),
        agentType: text('agent_type').notNull().default('openclaw'),
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
        hostKeyFingerprint: text('host_key_fingerprint'),
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
        lastSubdomainChangedAt: timestamp('last_subdomain_changed_at', {
            withTimezone: true
        }),
        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => [
        index('agents_user_id_idx').on(table.userId),
        index('agents_user_id_created_at_idx').on(
            table.userId,
            table.createdAt
        ),
        index('agents_polar_subscription_id_idx').on(table.polarSubscriptionId),
        index('agents_subdomain_idx').on(table.subdomain),
        index('agents_deletion_scheduled_at_idx').on(table.deletionScheduledAt)
    ]
)

export default agents