import { pgTable, text, timestamp, index, unique } from 'drizzle-orm/pg-core'
import users from '@/db/schema/users'

const referrals = pgTable(
    'referrals',
    {
        id: text('id').primaryKey(),
        referrerId: text('referrer_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        referredUserId: text('referred_user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => [
        index('referrals_referrer_id_idx').on(table.referrerId),
        index('referrals_referred_user_id_idx').on(table.referredUserId),
        unique('referrals_referred_user_unique').on(table.referredUserId)
    ]
)

export default referrals