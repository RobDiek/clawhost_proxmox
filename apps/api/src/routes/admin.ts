import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {
    requireAdmin2FA,
    adminSendOtp, adminVerifyOtp, adminTotpSetupQr, adminTotpSetupConfirm, adminTotpVerify,
    adminLogout, adminMe, adminDashboard,
    adminListClients, adminClientDetail,
    adminRestartInstance, adminSuspendInstance, adminResumeInstance,
    adminTerminateInstance, adminResetCredentials, adminSendCustomEmail,
    adminListPayments, adminRefundPayment,
    adminListAudit,
    adminToggleMaster,
    adminUpgradeInstance, adminBulkUpgrade, adminUpgradeProgress, adminVersionStatus,
    adminRefundAndTerminate,
    adminDashboardStatus, adminDashboardPublish,
} from '@/controllers/admin'

const app = new Hono()

app.use('*', cors({
    origin: ['https://admin.flowmatic.co.il', 'http://localhost:5173', 'http://localhost:3000'],
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
}))

// ── Auth (no token required) ──
app.post('/auth/email-otp', adminSendOtp)
app.post('/auth/email-verify', adminVerifyOtp)
app.post('/auth/totp-setup', adminTotpSetupQr)
app.post('/auth/totp-setup-confirm', adminTotpSetupConfirm)
app.post('/auth/totp-verify', adminTotpVerify)

// ── Protected (requires admin JWT) ──
app.use('/me', requireAdmin2FA)
app.use('/logout', requireAdmin2FA)
app.use('/dashboard', requireAdmin2FA)
app.use('/clients', requireAdmin2FA)
app.use('/clients/*', requireAdmin2FA)
app.use('/payments', requireAdmin2FA)
app.use('/payments/*', requireAdmin2FA)
app.use('/audit', requireAdmin2FA)

app.get('/me', adminMe)
app.post('/logout', adminLogout)
app.get('/dashboard', adminDashboard)

app.get('/clients', adminListClients)
app.get('/clients/:id', adminClientDetail)
app.post('/clients/:id/restart', adminRestartInstance)
app.post('/clients/:id/suspend', adminSuspendInstance)
app.post('/clients/:id/resume', adminResumeInstance)
app.post('/clients/:id/terminate', adminTerminateInstance)
app.post('/clients/:id/refund-and-terminate', adminRefundAndTerminate)
app.post('/clients/:id/reset-credentials', adminResetCredentials)
app.post('/clients/:id/send-email', adminSendCustomEmail)

app.get('/payments', adminListPayments)
app.post('/payments/:id/refund', adminRefundPayment)

// Master toggle + stack-version actions
app.post('/clients/:id/toggle-master', adminToggleMaster)
app.get('/clients/:id/version-status', adminVersionStatus)
app.post('/clients/:id/upgrade', adminUpgradeInstance)
app.get('/clients/:id/upgrade-progress', adminUpgradeProgress)
app.post('/upgrades/bulk', adminBulkUpgrade)

app.get('/audit', adminListAudit)

// ── DFS credits manual grant (Phase 3.6) ──
// Used for: bootstrap testing, customer-service refunds, welcome credits.
import { adminGrantCredits } from '@/controllers/hosting/credits'
app.post('/credits/grant', adminGrantCredits)

// ── Dashboard staging → prod publish ──
app.use('/dashboard-publish/*', requireAdmin2FA)
app.use('/dashboard-publish', requireAdmin2FA)
app.get('/dashboard-publish/status', adminDashboardStatus)
app.post('/dashboard-publish', adminDashboardPublish)

export default app