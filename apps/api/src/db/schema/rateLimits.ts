import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

const rateLimits = pgTable('rate_limits', {
    key: text('key').primaryKey(),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }).notNull()
})

export default rateLimits