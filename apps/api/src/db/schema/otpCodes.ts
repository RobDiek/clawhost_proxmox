import { pgTable, text, timestamp, integer, index } from 'drizzle-orm/pg-core'

const otpCodes = pgTable(
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

export default otpCodes