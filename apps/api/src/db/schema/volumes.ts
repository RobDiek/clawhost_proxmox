import { pgTable, text, timestamp, integer, index } from 'drizzle-orm/pg-core'
import users from '@/db/schema/users'
import claws from '@/db/schema/claws'

const volumes = pgTable(
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

export default volumes