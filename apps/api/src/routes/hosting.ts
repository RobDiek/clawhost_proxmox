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
    upgradePlan,
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
    buildStrategy,
    researchStage,
    addAgentToInstance,
    removeAgentFromInstance,
    readFile,
    writeFile,
    listFiles,
    fileTree,
    createFileOrDir,
    deleteFile,
    renameFile,
    deployCustomAgent,
    saveIntegration,
    testSmtp,
    serverStats,
    serverLogs,
    googleAuth,
    googleCallback,
    googleDisconnect,
    googleStatus,
    metaSaveCredentials,
    metaCallback,
    metaDisconnect,
    metaStatus,
    microsoftAuth,
    microsoftCallback,
    microsoftDisconnect,
    microsoftStatus,
    getOutputs,
    getOutput,
    ingestOutput,
    approveOutput,
    rejectOutput,
    editOutput,
    publishOutput,
    archiveOutput,
    deleteOutput,
    listBackups,
    createBackup,
    restoreBackup,
    backupReport
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
app.post('/instances/:id/upgrade-plan', upgradePlan)
app.delete('/instances/:id', deleteInstance)

// ── Setup (onboarding) ──
app.post('/instances/:id/setup/api-key', setupApiKey)
app.post('/instances/:id/setup/telegram', setupTelegram)
app.post('/instances/:id/setup/complete', completeOnboarding)
app.post('/instances/:id/setup/agents', setupAgents)
app.post('/instances/:id/setup/agents/analyze', analyzeAnswers)
app.post('/instances/:id/setup/agents/research', runResearch)
app.post('/instances/:id/setup/agents/strategy', buildStrategy)
app.post('/instances/:id/setup/agents/research/stage', researchStage)
app.post('/instances/:id/agents/add', addAgentToInstance)
app.post('/instances/:id/agents/remove', removeAgentFromInstance)

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
app.post('/instances/:id/integrations/test-smtp', testSmtp)

// ── Server ──
app.get('/instances/:id/stats', serverStats)
app.get('/instances/:id/logs', serverLogs)

// ── Backups ──
app.get('/instances/:id/backups', listBackups)
app.post('/instances/:id/backups/create', createBackup)
app.post('/instances/:id/backups/restore', restoreBackup)
app.post('/instances/:id/backup-report', backupReport)

// ── Google Workspace OAuth ──
app.get('/integrations/google/auth', googleAuth)
app.get('/integrations/google/callback', googleCallback)
app.post('/integrations/google/disconnect', googleDisconnect)
app.get('/integrations/google/status', googleStatus)

// ── Agent Outputs (approval queue) ──
app.get('/instances/:id/outputs', getOutputs)
app.get('/instances/:id/outputs/:outputId', getOutput)
app.post('/instances/:id/outputs/ingest', ingestOutput)
app.patch('/instances/:id/outputs/:outputId/approve', approveOutput)
app.patch('/instances/:id/outputs/:outputId/reject', rejectOutput)
app.patch('/instances/:id/outputs/:outputId/edit', editOutput)
app.patch('/instances/:id/outputs/:outputId/publish', publishOutput)
app.patch('/instances/:id/outputs/:outputId/archive', archiveOutput)
app.delete('/instances/:id/outputs/:outputId', deleteOutput)

// ── Microsoft 365 OAuth ──
app.get('/integrations/microsoft/auth', microsoftAuth)
app.get('/integrations/microsoft/callback', microsoftCallback)
app.post('/integrations/microsoft/disconnect', microsoftDisconnect)
app.get('/integrations/microsoft/status', microsoftStatus)

// ── Meta (Facebook/Instagram) OAuth ──
app.post('/instances/:id/integrations/meta/save-credentials', metaSaveCredentials)
app.get('/integrations/meta/callback', metaCallback)
app.post('/instances/:id/integrations/meta/disconnect', metaDisconnect)
app.get('/integrations/meta/status', metaStatus)

// ── RAM Health ──
app.get('/instances/:id/ram-health', async (c) => {
    const { checkRamNow, getRamStatus } = await import('@/services/ramMonitor')
    const { ok, fail } = await import('@/lib/response')
    const instanceId = c.req.param('id')
    const fresh = c.req.query('fresh') === '1'
    const status = fresh ? await checkRamNow(instanceId) : getRamStatus(instanceId)
    if (!status) return fail(c, 'No RAM data available', 404)
    return ok(c, status, 'RAM status retrieved.')
})

// ── Model Health ──
app.get('/models/health', async (c) => {
    const { getModelHealth } = await import('@/services/modelMonitor')
    const { ok } = await import('@/lib/response')
    return ok(c, getModelHealth())
})

// ── Admin ──
app.get('/admin/instances', adminGetInstances)
app.get('/admin/revenue', adminGetRevenue)
app.post('/admin/instances/:id/suspend', adminSuspendInstance)
app.post('/admin/instances/:id/terminate', adminTerminateInstance)

export default app
