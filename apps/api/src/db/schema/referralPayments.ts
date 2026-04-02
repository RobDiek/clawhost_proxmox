import { pgTable, text, timestamp, integer, index } from 'drizzle-orm/pg-core'
import referrals from '@/db/schema/referrals'

const referralPayments = pgTable(
    'referral_payments',
    {
        id: text('id').primaryKey(),
        referralId: text('referral_id')
            .notNull()
            .references(() => referrals.id, { onDelete: 'cascade' }),
        amount: integer('amount').notNull().default(0),
        type: text('type').notNull().default('purchase'),
        createdAt: timestamp('created_at', { withTimezone: true })
            .defaultNow()
            .notNull()
    },
    (table) => [index('referral_payments_referral_id_idx').on(table.referralId)]
)

export default referralPayments