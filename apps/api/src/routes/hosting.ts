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
    deleteInstance
} from '@/controllers/hosting'

const app = new Hono()

// Public routes (no auth required)
app.post('/configure', configureInstance)
app.post('/webhooks/allpay', handleAllpayWebhook)

// Authenticated routes (mounted after auth middleware in app.ts)
app.post('/checkout', checkout)
app.get('/subscriptions', getSubscriptions)
app.get('/instances', getInstances)
app.get('/instances/:id', getInstance)
app.get('/instances/:id/status', getInstanceStatus)
app.post('/instances/:id/restart', restartInstance)
app.delete('/instances/:id', deleteInstance)

export default app
