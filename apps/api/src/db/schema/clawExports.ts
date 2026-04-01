import { pgTable, text, timestamp, integer, index } from 'drizzle-orm/pg-core'
import users from '@/db/schema/users'
import claws from '@/db/schema/claws'

const clawExports = pgTable(
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

export default clawExports