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
    getMyInstances,
    checkSubdomain,
    setupApiKey,
    setupTelegram,
    completeOnboarding,
    setupAgents,
    analyzeAnswers,
    runResearch,
    readFile,
    writeFile,
    listFiles,
    fileTree,
    createFileOrDir,
    deleteFile,
    renameFile,
    deployCustomAgent,
    saveIntegration,
    serverStats,
    serverLogs,
    googleAuth,
    googleCallback,
    googleDisconnect,
    googleStatus
} from '@/controllers/hosting'

const app = new Hono()

// ── Auth ──
app.post('/auth/send-otp', sendOtpHosting)
app.post('/auth/verify-otp', verifyOtpHosting)
app.get('/auth/me', getMe)
app.get('/my-instances', getMyInstances)

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
app.post('/instances/:id/setup/agents/analyze', analyzeAnswers)
app.post('/instances/:id/setup/agents/research', runResearch)

// ── Files ──
app.get('/instances/:id/files', readFile)
app.put('/instances/:id/files', writeFile)
app.get('/instances/:id/files/list', listFiles)
app.get('/instances/:id/files/tree', fileTree)
app.post('/instances/:id/files/create', createFileOrDir)
app.delete('/instances/:id/files', deleteFile)
app.post('/instances/:id/files/rename', renameFile)
app.post('/instances/:id/files/deploy-agent', deployCustomAgent)
app.post('/instances/:id/integrations/save', saveIntegration)

// ── Server ──
app.get('/instances/:id/stats', serverStats)
app.get('/instances/:id/logs', serverLogs)

// ── Google Workspace OAuth ──
app.get('/integrations/google/auth', googleAuth)
app.get('/integrations/google/callback', googleCallback)
app.post('/integrations/google/disconnect', googleDisconnect)
app.get('/integrations/google/status', googleStatus)

// ── Admin ──
app.get('/admin/instances', adminGetInstances)
app.get('/admin/revenue', adminGetRevenue)
app.post('/admin/instances/:id/suspend', adminSuspendInstance)
app.post('/admin/instances/:id/terminate', adminTerminateInstance)

export default app
