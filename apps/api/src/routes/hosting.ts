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
    submitSupportRequest
} from '@/controllers/hosting'

const app = new Hono()

// Public routes (no auth required)
app.post('/configure', configureInstance)
app.post('/webhooks/allpay', handleAllpayWebhook)
app.post('/support', submitSupportRequest)

// Authenticated routes (mounted after auth middleware in app.ts)
app.post('/checkout', checkout)
app.get('/subscriptions', getSubscriptions)
app.get('/instances', getInstances)
app.get('/instances/:id', getInstance)
app.get('/instances/:id/status', getInstanceStatus)
app.post('/instances/:id/restart', restartInstance)
app.delete('/instances/:id', deleteInstance)

// Admin routes
app.get('/admin/instances', adminGetInstances)
app.get('/admin/revenue', adminGetRevenue)
app.post('/admin/instances/:id/suspend', adminSuspendInstance)
app.post('/admin/instances/:id/terminate', adminTerminateInstance)

export default app
