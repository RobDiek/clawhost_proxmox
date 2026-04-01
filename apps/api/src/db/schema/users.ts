import { pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core'
import { userRole } from '@openclaw/shared'

const users = pgTable('users', {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    name: text('name'),
    authMethods: text('auth_methods').array().default([]),
    polarCustomerId: text('polar_customer_id'),
    hasLicense: boolean('has_license').notNull().default(false),
    role: text('role').notNull().default(userRole.user),
    referralCode: text('referral_code').unique(),
    referralCodeChanged: boolean('referral_code_changed')
        .notNull()
        .default(false),
    referredBy: text('referred_by'),
    createdAt: timestamp('created_at', { withTimezone: true })
        .defaultNow()
        .notNull()
})

export default users