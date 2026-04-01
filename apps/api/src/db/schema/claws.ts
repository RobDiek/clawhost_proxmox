import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core'
import users from '@/db/schema/users'
import sshKeys from '@/db/schema/sshKeys'

const claws = pgTable(
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
        index('claws_user_id_created_at_idx').on(table.userId, table.createdAt),
        index('claws_polar_subscription_id_idx').on(table.polarSubscriptionId),
        index('claws_subdomain_idx').on(table.subdomain),
        index('claws_deletion_scheduled_at_idx').on(table.deletionScheduledAt)
    ]
)

export default claws