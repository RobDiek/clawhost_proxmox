import { pgTable, text, timestamp, index, unique } from 'drizzle-orm/pg-core'
import users from '@/db/schema/users'

const emails = pgTable(
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

export default emails