import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core'
import users from '@/db/schema/users'

const waitlist = pgTable(
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

export default waitlist