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
    buildStrategyScenarios,
    commitStrategyScenario,
    generateOpsBrief,
    getOpsBrief,
    getApiUsage,
    seedFacts,
    benchmarkFacts,
    saveGoogleAdsConfig,
    getGoogleAdsConfigStatus,
    researchStage,
    researchSummary,
    strategySummary,
    resetResearch,
    resetStrategy,
    regenerateContentPlan,
    getContentPlan,
    generateOptimizationReport,
    getLatestOptimizationReport,
    saveHistoricalAssets,
    getHistoricalAssets,
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
    listAgentIntegrations,
    getAgentIntegrationEndpoint,
    setAgentIntegrationEndpoint,
    deleteAgentIntegrationEndpoint,
    deleteOllamaModel,
    // installTwenty, // removed — AGPLv3
    gscAuth,
    gscCallback,
    gscDisconnect,
    gscStatus,
    gscSetSite,
    saveDataforseoKey,
    getDataforseoStatus,
    removeDataforseoKey,
    saveFirecrawlKey,
    getFirecrawlStatus,
    removeFirecrawlKey,
    saveRedditCredentials,
    getRedditStatus,
    disconnectReddit,
    testReddit,
    getSchedules,
    saveSchedules,
    seoValidate,
    seoFirstRun,
    seoStatus,
    saveGithubConfig,
    getGithubStatus,
    disconnectGithub,
    publishToGithub,
    testGithubIntegration,
    extractBrand,
    analyzeLogoEndpoint,
    draftBrandBook,
    approveBrandBook,
    getBrandBook,
    getBrandBookVersions,
    saveCreativeKeys,
    getCreativeStatus,
    disconnectCreativeKey,
    listCreativeRenders,
    getCreativeRender,
    triggerCreativeRender,
    mineReferences,
    listReferences,
    decomposeReferences,
    deleteReference,
    attachMapping,
    listMappings,
    deleteMapping,
    listPerformance,
    getRenderPerformance,
    triggerPerformanceSync,
    listFatigueAlerts,
    updateFatigueAlert,
    createHypothesis,
    listHypotheses,
    getHypothesis,
    preRegisterHypothesis,
    addHypothesisVariant,
    analyzeHypothesisEndpoint,
    abandonHypothesis,
    publishToMeta,
    metaListAdAccounts,
    metaListCampaigns,
    metaListAdSets,
    publishToGoogleAds,
    googleAdsListAccounts,
    googleAdsListCampaigns,
    googleAdsListAdGroups,
    triggerWeeklyReport,
    getLatestWeeklyReport,
    triggerYotzer,
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
app.post('/instances/:id/setup/agents/strategy/scenarios', buildStrategyScenarios)
app.post('/instances/:id/setup/agents/strategy/commit', commitStrategyScenario)
app.post('/instances/:id/setup/agents/ops-brief', generateOpsBrief)
app.get('/instances/:id/setup/agents/ops-brief', getOpsBrief)
app.get('/instances/:id/api-usage', getApiUsage)
app.post('/instances/:id/facts/seed', seedFacts)
app.post('/instances/:id/facts/benchmark', benchmarkFacts)

// ── Google Ads configuration ──
app.post('/instances/:id/integrations/googleads/save', saveGoogleAdsConfig)
app.get('/instances/:id/integrations/googleads/status', getGoogleAdsConfigStatus)
app.post('/instances/:id/setup/agents/research/stage', researchStage)
app.post('/instances/:id/setup/agents/research/summary', researchSummary)
app.post('/instances/:id/setup/agents/strategy/summary', strategySummary)
app.post('/instances/:id/setup/agents/research/reset', resetResearch)
app.post('/instances/:id/setup/agents/strategy/reset', resetStrategy)
app.post('/instances/:id/setup/agents/content-plan/regenerate', regenerateContentPlan)
app.get('/instances/:id/setup/agents/content-plan', getContentPlan)
app.post('/instances/:id/optimization/weekly', generateOptimizationReport)
app.get('/instances/:id/optimization/latest', getLatestOptimizationReport)
app.post('/instances/:id/assets', saveHistoricalAssets)
app.get('/instances/:id/assets', getHistoricalAssets)
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

// ── Google Search Console OAuth ──
app.get('/integrations/gsc/auth', gscAuth)
app.get('/integrations/gsc/callback', gscCallback)
app.post('/integrations/gsc/disconnect', gscDisconnect)
app.get('/integrations/gsc/status', gscStatus)
app.post('/integrations/gsc/set-site', gscSetSite)

// ── DataForSEO ──
app.post('/integrations/dataforseo/save', saveDataforseoKey)
app.get('/integrations/dataforseo/status', getDataforseoStatus)
app.post('/integrations/dataforseo/disconnect', removeDataforseoKey)

// ── Firecrawl ──
app.post('/integrations/firecrawl/save', saveFirecrawlKey)
app.get('/integrations/firecrawl/status', getFirecrawlStatus)
app.post('/integrations/firecrawl/disconnect', removeFirecrawlKey)

// ── Reddit (script app / PRAW-style) ──
app.post('/integrations/reddit/save', saveRedditCredentials)
app.get('/integrations/reddit/status', getRedditStatus)
app.post('/integrations/reddit/disconnect', disconnectReddit)
app.post('/integrations/reddit/test', testReddit)

// ── GitHub (Content Publishing) ──
app.post('/integrations/github/save', saveGithubConfig)
app.get('/integrations/github/status', getGithubStatus)
app.post('/integrations/github/disconnect', disconnectGithub)
app.post('/instances/:id/integrations/github/test', testGithubIntegration)
app.post('/instances/:id/github/publish', publishToGithub)

// ── Schedules (bundle-managed) ──
app.get('/instances/:id/schedules', getSchedules)
app.post('/instances/:id/schedules', saveSchedules)

// ── Brand Foundation (Phase B1) — extract → analyze logo → compose → approve → distribute ──
app.post('/instances/:id/brand/extract',      extractBrand)
app.post('/instances/:id/brand/analyze-logo', analyzeLogoEndpoint)
app.post('/instances/:id/brand/draft',        draftBrandBook)
app.post('/instances/:id/brand/approve',      approveBrandBook)
app.get('/instances/:id/brand',               getBrandBook)
app.get('/instances/:id/brand/versions',      getBrandBookVersions)

// ── Creative Generation (Phase B2) — BYOK fal.ai/ElevenLabs + render lifecycle ──
app.post('/instances/:id/integrations/creative/save',       saveCreativeKeys)
app.get('/instances/:id/integrations/creative/status',      getCreativeStatus)
app.post('/instances/:id/integrations/creative/disconnect', disconnectCreativeKey)
app.get('/instances/:id/creative/renders',                  listCreativeRenders)
app.get('/instances/:id/creative/renders/:renderId',        getCreativeRender)
app.post('/instances/:id/creative/render',                  triggerCreativeRender)

// ── Creative References (Phase B3) — competitor ad mining + DNA decomposer ──
app.post('/instances/:id/creative/references/mine',         mineReferences)
app.get('/instances/:id/creative/references',               listReferences)
app.post('/instances/:id/creative/references/decompose',    decomposeReferences)
app.delete('/instances/:id/creative/references/:refId',     deleteReference)

// ── Creative Performance (Phase B5) — platform mappings + daily metrics + fatigue ──
app.post('/instances/:id/creative/mappings',                        attachMapping)
app.get('/instances/:id/creative/mappings',                         listMappings)
app.delete('/instances/:id/creative/mappings/:mappingId',           deleteMapping)
app.get('/instances/:id/creative/performance',                      listPerformance)
app.get('/instances/:id/creative/performance/:renderId',            getRenderPerformance)
app.post('/instances/:id/creative/performance/sync',                triggerPerformanceSync)
app.get('/instances/:id/creative/fatigue-alerts',                   listFatigueAlerts)
app.patch('/instances/:id/creative/fatigue-alerts/:alertId',        updateFatigueAlert)

// ── Creative Hypotheses (Phase B6) — A/B testing framework ──
app.post('/instances/:id/creative/hypotheses',                      createHypothesis)
app.get('/instances/:id/creative/hypotheses',                       listHypotheses)
app.get('/instances/:id/creative/hypotheses/:hypId',                getHypothesis)
app.patch('/instances/:id/creative/hypotheses/:hypId/pre-register', preRegisterHypothesis)
app.patch('/instances/:id/creative/hypotheses/:hypId/add-variant',  addHypothesisVariant)
app.post('/instances/:id/creative/hypotheses/:hypId/analyze',       analyzeHypothesisEndpoint)
app.patch('/instances/:id/creative/hypotheses/:hypId/abandon',      abandonHypothesis)

// ── Creative Publishing (Phase C) — auto-publish to Meta/Google + auto-mapping ──
app.post('/instances/:id/creative/publish',                         publishToMeta)
app.get('/instances/:id/creative/meta/ad-accounts',                 metaListAdAccounts)
app.get('/instances/:id/creative/meta/campaigns',                   metaListCampaigns)
app.get('/instances/:id/creative/meta/adsets',                      metaListAdSets)

// ── Google Ads Publishing (Phase C mirror) ──
app.post('/instances/:id/creative/publish-google',                  publishToGoogleAds)
app.get('/instances/:id/creative/google/accounts',                  googleAdsListAccounts)
app.get('/instances/:id/creative/google/campaigns',                 googleAdsListCampaigns)
app.get('/instances/:id/creative/google/ad-groups',                 googleAdsListAdGroups)

// ── Weekly Creative Report (Phase D) ──
app.post('/instances/:id/creative/weekly-report/generate',          triggerWeeklyReport)
app.get('/instances/:id/creative/weekly-report/latest',             getLatestWeeklyReport)

// ── Yotzer Trigger (Phase E) — user-invoked brief from dashboard ──
app.post('/instances/:id/creative/yotzer/trigger',                  triggerYotzer)

// ── SEO First Run ──
app.post('/instances/:id/seo/validate', seoValidate)
app.post('/instances/:id/seo/first-run', seoFirstRun)
app.get('/instances/:id/seo/status', seoStatus)

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
app.delete('/instances/:id/ollama/model', deleteOllamaModel)

// Twenty CRM removed — AGPLv3 license risk

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
app.get('/oauth/microsoft/callback', microsoftCallback)  // Azure redirect URI compat
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

// ── Newsletter Subscribe (public, no auth) ──
app.post('/newsletter', async (c) => {
    const { ok, fail } = await import('@/lib/response')
    try {
        const { email } = await c.req.json<{ email: string }>()
        if (!email || !email.includes('@')) return fail(c, 'אימייל לא תקין', 400)

        // Add to Resend audience
        const RESEND_KEY = 're_QtnrmnjT_6m26FLWi6MnLBkmPXDDCHu5c'
        // First, get or create audience
        const audiencesRes = await fetch('https://api.resend.com/audiences', {
            headers: { 'Authorization': `Bearer ${RESEND_KEY}` }
        })
        const audiences = await audiencesRes.json() as { data?: Array<{ id: string; name: string }> }
        let audienceId = audiences.data?.[0]?.id

        if (!audienceId) {
            // Create audience
            const createRes = await fetch('https://api.resend.com/audiences', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Flowmatic Newsletter' })
            })
            const created = await createRes.json() as { id?: string }
            audienceId = created.id
        }

        if (!audienceId) return fail(c, 'שגיאה ביצירת רשימה', 500)

        // Add contact to audience
        const addRes = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, unsubscribed: false })
        })
        const addData = await addRes.json() as { id?: string; error?: any }

        if (addData.error) {
            console.error('Resend add contact error:', addData.error)
            return fail(c, 'שגיאה בהרשמה', 500)
        }

        console.log(`Newsletter: ${email} added to audience ${audienceId}`)
        return ok(c, null, 'נרשמת בהצלחה!')
    } catch (err) {
        console.error('Newsletter error:', err)
        return fail(c, 'שגיאה בהרשמה', 500)
    }
})

// ── Contact Form (public, no auth) ──
app.post('/contact', async (c) => {
    const { ok, fail } = await import('@/lib/response')
    try {
        const { name, phone, type, message } = await c.req.json<{ name: string; phone: string; type: string; message: string }>()
        if (!name || !phone) return fail(c, 'שם וטלפון חובה', 400)

        const { default: telegram } = await import('@/services/telegram')
        const text = `📩 *פנייה חדשה מהאתר*\n\n` +
            `👤 *שם:* ${name}\n` +
            `📱 *טלפון:* ${phone}\n` +
            `📋 *סוג:* ${type || 'לא צוין'}\n` +
            `💬 *הודעה:* ${message || 'ללא'}\n\n` +
            `🕐 ${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`

        await telegram.alertAdmin(text)
        return ok(c, null, 'הפנייה נשלחה בהצלחה')
    } catch (err) {
        console.error('Contact form error:', err)
        return fail(c, 'שגיאה בשליחה', 500)
    }
})

// ── Admin ──
app.get('/admin/instances', adminGetInstances)
app.get('/admin/revenue', adminGetRevenue)
app.post('/admin/instances/:id/suspend', adminSuspendInstance)
app.post('/admin/instances/:id/terminate', adminTerminateInstance)

export default app