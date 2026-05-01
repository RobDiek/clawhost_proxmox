const subscriptionStatus = {
    pending: 'pending',
    active: 'active',
    canceled: 'canceled',
    incomplete: 'incomplete',
    incompleteExpired: 'incomplete_expired',
    pastDue: 'past_due',
    trialing: 'trialing',
    unpaid: 'unpaid',
    revoked: 'revoked'
} as const

export { subscriptionStatus }