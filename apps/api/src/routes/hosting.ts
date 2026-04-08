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
    addStorage,
    deleteAccount,
    adminGetInstances,
    adminGetRevenue,
    adminSuspendInstance,
    adminTerminateInstance,
    submitSupportRequest,
    sendOtpHosting,
    verifyOtpHosting,
    getMe,
    getMyInstances,
    setup2fa,
    verifySetup2fa,
    verify2fa,
    disable2fa,
    acceptTerms,
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
    setupPersonalAgent,
    getMemories,
    deleteMemory,
    clearMemories,
    healthReport,
    getHealthStatus,
    toggleAutoHeal,
    getUsage,
    diagnoseError,
    getOllamaStatus,
    installOllama,
    pullOllamaModel,
    listMcpServers,
    addMcpServer,
    removeMcpServer,
    getMcpCatalog,
    getMyReferralCode,
    getMyReferrals,
    validateReferralCode,
    activateReferralTrial,
    saveGbpConfig,
    getGbpConfig,
    createGbpPost,
    getGbpReviews,
    replyToGbpReview,
    saveWaConfig,
    getWaConfigEndpoint,
    getWaContacts,
    addWaContact,
    importWaContacts,
    optOutWaContact,
    getWaTemplates,
    createWaTemplate,
    submitWaTemplate,
    refreshWaTemplateStatus,
    sendWaBroadcast,
    getWaSends,
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
    backupReport,
    getLitellmStatusEndpoint,
    setLitellmApiKeyEndpoint,
    getLitellmUsageEndpoint,
    deepCrawlCompetitors,
    getCrawlStatus,
    uploadKnowledgeDoc,
    searchKnowledgeEndpoint,
    listKnowledgeDocs,
    deleteKnowledgeDoc,
    guardScan,
    guardStatus,
    deployCrewEndpoint,
    runCrewEndpoint,
    listCrewsEndpoint,
    getLangfuseStatus,
    listAgentIntegrations,
    getAgentIntegrationEndpoint,
    setAgentIntegrationEndpoint,
    deleteAgentIntegrationEndpoint
} from '@/controllers/hosting'

const app = new Hono()

// ── Auth ──
app.post('/auth/send-otp', sendOtpHosting)
app.post('/auth/verify-otp', verifyOtpHosting)
app.get('/auth/me', getMe)
app.get('/my-instances', getMyInstances)
app.post('/auth/2fa/setup', setup2fa)
app.post('/auth/2fa/verify-setup', verifySetup2fa)
app.post('/auth/2fa/verify', verify2fa)
app.post('/auth/2fa/disable', disable2fa)
app.post('/auth/accept-terms', acceptTerms)

// ── Public ──
app.post('/configure', configureInstance)
app.post('/checkout', checkout)
app.post('/webhooks/allpay', handleAllpayWebhook)
app.post('/support', submitSupportRequest)
app.get('/subdomain/check', checkSubdomain)
app.post('/instances/:id/health-report', healthReport) // called from client VPS, no auth

// ── Instances ──
app.get('/subscriptions', getSubscriptions)
app.get('/instances', getInstances)
app.get('/instances/:id', getInstance)
app.get('/instances/:id/status', getInstanceStatus)
app.post('/instances/:id/restart', restartInstance)
app.post('/instances/:id/upgrade-plan', upgradePlan)
app.post('/instances/:id/add-storage', addStorage)
app.delete('/instances/:id', deleteInstance)
app.delete('/account', deleteAccount)

// ── Setup (onboarding) ──
app.post('/instances/:id/setup/api-key', setupApiKey)
app.post('/instances/:id/setup/telegram', setupTelegram)
app.post('/instances/:id/setup/complete', completeOnboarding)
app.post('/instances/:id/setup/personal-agent', setupPersonalAgent)
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

// ── Diagnostics ──
app.post('/instances/:id/diagnose', diagnoseError)

// ── MCP Servers ──
app.get('/instances/:id/mcp/servers', listMcpServers)
app.post('/instances/:id/mcp/add', addMcpServer)
app.delete('/instances/:id/mcp/:serverId', removeMcpServer)
app.get('/mcp/catalog', getMcpCatalog)

// ── Langfuse (Observability) ──
app.get('/instances/:id/langfuse/status', getLangfuseStatus)

// ── CrewAI (Multi-agent) ──
app.post('/instances/:id/crews/deploy', deployCrewEndpoint)
app.post('/instances/:id/crews/:crewName/run', runCrewEndpoint)
app.get('/instances/:id/crews', listCrewsEndpoint)

// ── LLM Guard (Security) ──
app.post('/instances/:id/guard/scan', guardScan)
app.get('/instances/:id/guard/status', guardStatus)

// ── Knowledge Base (RAG) ──
app.post('/instances/:id/knowledge/upload', uploadKnowledgeDoc)
app.post('/instances/:id/knowledge/search', searchKnowledgeEndpoint)
app.get('/instances/:id/knowledge/documents', listKnowledgeDocs)
app.delete('/instances/:id/knowledge/:docId', deleteKnowledgeDoc)

// ── Crawl4AI (Research Deep Crawl) ──
app.post('/instances/:id/research/deep-crawl', deepCrawlCompetitors)
app.get('/instances/:id/research/crawl-status', getCrawlStatus)

// ── LiteLLM AI Gateway ──
app.get('/instances/:id/litellm/status', getLitellmStatusEndpoint)
app.post('/instances/:id/litellm/api-key', setLitellmApiKeyEndpoint)
app.get('/instances/:id/litellm/usage', getLitellmUsageEndpoint)

// ── Ollama ──
app.get('/instances/:id/ollama/status', getOllamaStatus)
app.post('/instances/:id/ollama/install', installOllama)
app.post('/instances/:id/ollama/pull', pullOllamaModel)

// ── Referral Program ──
app.get('/referral/my-code', getMyReferralCode)
app.get('/referral/my-referrals', getMyReferrals)
app.get('/referral/validate/:code', validateReferralCode)  // public, no auth
app.post('/referral/activate', activateReferralTrial)

// ── Google Business Profile ──
app.post('/instances/:id/gbp/config', saveGbpConfig)
app.get('/instances/:id/gbp/config', getGbpConfig)
app.post('/instances/:id/gbp/posts', createGbpPost)
app.get('/instances/:id/gbp/reviews', getGbpReviews)
app.post('/instances/:id/gbp/reviews/reply', replyToGbpReview)

// ── WhatsApp Business ──
app.post('/instances/:id/whatsapp/config', saveWaConfig)
app.get('/instances/:id/whatsapp/config', getWaConfigEndpoint)
app.get('/instances/:id/whatsapp/contacts', getWaContacts)
app.post('/instances/:id/whatsapp/contacts', addWaContact)
app.post('/instances/:id/whatsapp/contacts/import', importWaContacts)
app.patch('/instances/:id/whatsapp/contacts/:contactId/opt-out', optOutWaContact)
app.get('/instances/:id/whatsapp/templates', getWaTemplates)
app.post('/instances/:id/whatsapp/templates', createWaTemplate)
app.post('/instances/:id/whatsapp/templates/:templateId/submit', submitWaTemplate)
app.post('/instances/:id/whatsapp/templates/refresh', refreshWaTemplateStatus)
app.post('/instances/:id/whatsapp/send', sendWaBroadcast)
app.get('/instances/:id/whatsapp/sends', getWaSends)

// ── Agent Integrations (per-agent isolation) ──
app.get('/instances/:id/agents/:agentType/integrations', listAgentIntegrations)
app.get('/instances/:id/agents/:agentType/integrations/:type', getAgentIntegrationEndpoint)
app.post('/instances/:id/agents/:agentType/integrations/:type', setAgentIntegrationEndpoint)
app.delete('/instances/:id/agents/:agentType/integrations/:type', deleteAgentIntegrationEndpoint)

// ── Health (Self-Healing) ──
app.get('/instances/:id/health', getHealthStatus)
app.patch('/instances/:id/auto-heal', toggleAutoHeal)
app.get('/instances/:id/usage', getUsage)

// ── Memories (Mem0) ──
app.get('/instances/:id/memories', getMemories)
app.delete('/instances/:id/memories/:memoryId', deleteMemory)
app.delete('/instances/:id/memories', clearMemories)

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
