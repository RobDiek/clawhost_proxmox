import { Hono } from 'hono'
import {
    configureInstance,
    checkout,
    handleAllpayWebhook,
    getSubscriptions,
    getInstances,
    getInstance,
    getInstanceStatus,
    restartInstance,
    deleteInstance,
    adminGetInstances,
    adminGetRevenue,
    adminSuspendInstance,
    adminTerminateInstance,
    submitSupportRequest,
    sendOtpHosting,
    verifyOtpHosting,
    getMe,
    checkSubdomain,
    setupApiKey,
    setupTelegram,
    completeOnboarding,
    setupAgents
} from '@/controllers/hosting'

const app = new Hono()

// ── Auth ──
app.post('/auth/send-otp', sendOtpHosting)
app.post('/auth/verify-otp', verifyOtpHosting)
app.get('/auth/me', getMe)

// ── Public ──
app.post('/configure', configureInstance)
app.post('/checkout', checkout)
app.post('/webhooks/allpay', handleAllpayWebhook)
app.post('/support', submitSupportRequest)
app.get('/subdomain/check', checkSubdomain)

// ── Instances ──
app.get('/subscriptions', getSubscriptions)
app.get('/instances', getInstances)
app.get('/instances/:id', getInstance)
app.get('/instances/:id/status', getInstanceStatus)
app.post('/instances/:id/restart', restartInstance)
app.delete('/instances/:id', deleteInstance)

// ── Setup (onboarding) ──
app.post('/instances/:id/setup/api-key', setupApiKey)
app.post('/instances/:id/setup/telegram', setupTelegram)
app.post('/instances/:id/setup/complete', completeOnboarding)
app.post('/instances/:id/setup/agents', setupAgents)

// ── Admin ──
app.get('/admin/instances', adminGetInstances)
app.get('/admin/revenue', adminGetRevenue)
app.post('/admin/instances/:id/suspend', adminSuspendInstance)
app.post('/admin/instances/:id/terminate', adminTerminateInstance)

export default app
