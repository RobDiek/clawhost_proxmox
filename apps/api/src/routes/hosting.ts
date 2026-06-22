import { Hono } from 'hono'
import { devConnect, devStatus, devDisconnect } from '@/controllers/hosting/devAgent'
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
    updateMyProfile,
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
    setGoogleAdsMode,
    requestHaasMccInvite,
    setupAgents,
    analyzeAnswers,
    enrichProfile,
    runResearch,
    buildStrategy,
    buildStrategyScenarios,
    commitStrategyScenario,
    generateOpsBrief,
    getOpsBrief,
    getApiUsage,
    saveGoogleAdsConfig,
    getGoogleAdsConfigStatus,
    disconnectGoogleAdsConfig,
    listGoogleAdsCampaignsForScope,
    saveGoogleAdsCampaignScope,
    setBiddingObjectiveEndpoint,
    getBiddingObjectiveRecommendation,
    getWpCompanionStatus,
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
    collectMetrics,
    markContentPlanItemPublished,
    archiveContentPlanItem,
    getPaidProfile,
    savePaidProfile,
    uploadHistoricalReports,
    runMazhirAuditController,
    getMazhirAudit,
    getMazhirDataPreflight,
    getMazhirTenantState,
    generateMonthlyPlanController,
    getMonthlyPlanController,
    approveMonthlyTask,
    rejectMonthlyTask,
    skipMonthlyTask,
    completeMonthlyTaskManually,
    rescheduleMonthlyTask,
    generateMazhirMediaPlan,
    getMazhirMediaPlan,
    approveMazhirMediaPlan,
    getMazhirMediaPlanManualHtml,
    getAgentChatFeedController,
    postAgentChat,
    reviseMazhirMediaPlan,
    startBrandV2, getBrandV2Draft, getBrandV2Approved, getBrandV2History,
    patchBrandV2Draft, uploadBrandAsset, normalizeBrandLogo, extractColorsFromImage,
    submitBrandV2, approveBrandV2, discardBrandV2Draft, startOverBrandV2,
    editApprovedBrandV2, getBrandV2QualityGates,
    scanWebsiteForBrandV2,
    generateBrandLogoCandidates, adoptGeneratedBrandLogo,
    generateBrandImagery, generateBrandVoiceFor, generateBrandPersonasFor, generateBrandColorPaletteFor,
    exportBrandV2Html, exportBrandV2AssetManifest,
    listMazhirGtmTargets,
    saveMazhirGtmTarget,
    createMazhirGtmContainer,
    getMazhirGtmInstallSnippet,
    getGtmIntegrationDiagnostic,
    runGtmAutoFix,
    setupMazhirConversions,
    getConversionSuggestions,
    confirmConversionMappings,
    detectExistingConversionActions,
    applyConversionMapping,
    getConversionDraft,
    applySelectedConversionMapping,
    autoSetupMazhirGtm,
    getTrackingHealth,
    applyAdsRecommendations,
    getMazhirPreflight,
    executeMazhirPlan,
    getMazhirWpSnippet,
    installGtmSnippetAuto,
    getTrackingConflicts,
    resolveTrackingConflictHandler,
    getSetupReadiness,
    runSetupReadinessAuditHandler,
    previewPageRefresh,
    publishPageRefreshDraftHandler,
    getAgentStats,
    draftContentPlanItem,
    getMediaSettings,
    updateMediaSettings,
    testGenerateMedia,
    getContentPlanItemMedia,
    regenerateItemMedia,
    updateRenderStatus,
    uploadUserMedia,
    addAgentToInstance,
    removeAgentFromInstance,
    resetAgentConfig,
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
    testWordpress,
    serverStats,
    serverLogs,
    diskBreakdown,
    diskCleanup,
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
    bulkApproveOutputs,
    bulkRejectOutputs,
    retryFailedTaskNow,
    markActionStep,
    markManualDone,
    sgtmConfigure,
    gtmFreshStack,
    gtmFreshStackPreflight,
    gtmResolveConflict,
    applySafetyFix,
    applyBiddingStrategy,
    listBiddingStrategies,
    restoreBiddingFromHistory,
    listActiveDeferredActions,
    recordDeferredActionEndpoint,
    restoreDeferredAction,
    migrateBiddingHistoryEndpoint,
    wpCompanionPluginZip,
    rejectOutput,
    editOutput,
    publishOutput,
    archiveOutput,
    deleteOutput,
    exportOutput,
    telegramWebhook,
    listBackups,
    createBackup,
    restoreBackup,
    deleteBackup,
    backupReport,
    installComplete,
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
    saveShopifyConfig,
    getShopifyStatus,
    testShopify,
    disconnectShopify,
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
    getCreativeRouting,
    saveCreativeRouting,
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
    taskChat,
    triggerYotzer,
    getMarketingIntents,
    saveMarketingIntents,
    getIntegrationHub,
    setIntegrationState,
    syncIntegrationStates,
    pipelinePrecheck,
    getMarketingCatalog,
    previewHubForIntents,
    setPipelineActivationEndpoint,
    previewIntentCleanup,
    runPaidHypothesesEngineController,
    listPaidHypotheses,
    getPaidHypothesisById,
    approvePaidHypothesisController,
    declinePaidHypothesisController,
    startTestingPaidController,
    resolvePaidHypothesisController,
    executePaidHypothesisController,
    runPaidLearnerAggregation,
    listPaidLearnings,
    previewPaidLearningsInjection,
    getCrossPlatformTruthController,
    auditOnboarding, auditOnboardingText, runAuditNow,
    getLatestManifest, getInstanceVersionStatus,
    triggerInstanceUpgrade, getUpgradeProgressEndpoint,
} from '@/controllers/hosting'

const app = new Hono()

// ── Phase 4.3-O H1 (defensive): observability middleware. ──
// All /hosting/* routes are designed to perform JWT auth INSIDE each controller
// (via resolveUserId + getOwnedInstance) — Firebase auth at app.ts is intentionally
// NOT applied here. This works as long as every new controller respects the
// contract; a single forgotten resolveUserId call = silent bypass. As a safety
// net, this middleware logs (does NOT block) any request hitting a non-unauth-
// allowlisted /hosting endpoint without an Authorization header. Operator
// reviews logs to catch regressions early.
//
// Allowlist — endpoints that legitimately accept unauth requests (login OTP,
// webhooks, OAuth callbacks, public referral validation, contact forms).
const HOSTING_UNAUTH_ALLOWLIST: Array<RegExp> = [
    /^\/auth\/send-otp$/,
    /^\/auth\/verify-otp$/,
    /^\/webhooks\//,                                  // AllPay, future webhooks
    /^\/telegram\/webhook\//,
    /^\/integrations\/(google|gsc|meta|microsoft)\/callback$/,
    /^\/oauth\/microsoft\/callback$/,
    // Phase 4.3-O fix: OAuth /auth START endpoints redirect from a browser link;
    // they can't carry an Authorization header. Token is in query (?token=) and
    // the controller validates it. This is intentional, not a bypass.
    /^\/integrations\/(google|gsc|meta|microsoft)\/auth$/,
    /^\/referral\/validate\//,
    /^\/newsletter\//,
    /^\/contact\//,
    /^\/health$/,
]
app.use('/*', async (c, next) => {
    const path = c.req.path.replace(/^\/hosting/, '')   // strip /hosting prefix
    const isUnauthAllowed = HOSTING_UNAUTH_ALLOWLIST.some(re => re.test(path))
    if (!isUnauthAllowed) {
        const authHeader = c.req.header('Authorization')
        if (!authHeader?.startsWith('Bearer ')) {
            console.warn(`[hosting-auth-guard] ${c.req.method} ${c.req.path} — request without Authorization header on auth-required route. Controllers MUST validate; if this fires, a controller may be bypassing auth.`)
            // Soft warn for now — controllers still enforce. Future hard-block:
            // return c.json({ success: false, message: 'Unauthorized' }, 401)
        }
    }
    return next()
})

// ── Auth ──
app.post('/auth/send-otp', sendOtpHosting)
app.post('/auth/verify-otp', verifyOtpHosting)
app.get('/auth/me', getMe)
app.put('/auth/profile', updateMyProfile)
app.get('/my-instances', getMyInstances)

// ── Phase 1.5: User-facing tenant management (gated by user.agencyModeEnabled) ──
import {
    listMyTenants, getMyTenant, createMyTenant, updateMyTenant, deleteMyTenant,
    assignInstanceToMyTenant, listMyInstancesWithTenant,
} from '@/controllers/hosting/tenants'
app.get('/me/tenants', listMyTenants)
app.get('/me/tenants/instances', listMyInstancesWithTenant)
app.get('/me/tenants/:id', getMyTenant)
app.post('/me/tenants', createMyTenant)
app.patch('/me/tenants/:id', updateMyTenant)
app.delete('/me/tenants/:id', deleteMyTenant)
app.post('/me/tenants/:id/assign', assignInstanceToMyTenant)

// ── Phase 2.4: User-facing multi-MATEH agent management ──
import {
    listMyAgents, getMyAgent, createMyAgent, updateMyAgent, deleteMyAgent,
} from '@/controllers/hosting/matehAgentsApi'
app.get('/me/agents', listMyAgents)
app.get('/me/agents/:agentId', getMyAgent)
app.post('/me/agents', createMyAgent)
app.patch('/me/agents/:agentId', updateMyAgent)
app.delete('/me/agents/:agentId', deleteMyAgent)
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
app.post('/telegram/webhook/:instanceId', telegramWebhook)   // called from Telegram, no auth (verified by secret_token header)

// ── Instances ──
app.get('/subscriptions', getSubscriptions)
app.get('/instances', getInstances)
app.get('/instances/:id', getInstance)
app.get('/instances/:id/status', getInstanceStatus)
app.post('/instances/:id/restart', restartInstance)
// Claude Developer agent (roadmap/15) — connect/status/disconnect
app.post('/instances/:id/dev/connect', devConnect)
app.get('/instances/:id/dev/status', devStatus)
app.post('/instances/:id/dev/disconnect', devDisconnect)
app.post('/instances/:id/upgrade-plan', upgradePlan)
app.post('/instances/:id/add-storage', addStorage)
app.delete('/instances/:id', deleteInstance)
app.delete('/account', deleteAccount)

// ── Stack version + upgrade (Sprint A + B) ──
app.get('/version/manifest', getLatestManifest)
app.get('/instances/:id/version-status', getInstanceVersionStatus)
app.post('/instances/:id/upgrade', triggerInstanceUpgrade)
app.get('/instances/:id/upgrade-progress', getUpgradeProgressEndpoint)

// ── Setup (onboarding) ──
app.post('/instances/:id/setup/api-key', setupApiKey)
app.post('/instances/:id/setup/telegram', setupTelegram)
app.post('/instances/:id/setup/complete', completeOnboarding)
app.post('/instances/:id/setup/personal-agent', setupPersonalAgent)
app.post('/instances/:id/setup/agents', setupAgents)
app.post('/instances/:id/setup/agents/analyze', analyzeAnswers)
app.post('/instances/:id/profile/enrich', enrichProfile)
app.post('/instances/:id/setup/agents/research', runResearch)
app.post('/instances/:id/setup/agents/strategy', buildStrategy)
app.post('/instances/:id/setup/agents/strategy/scenarios', buildStrategyScenarios)
app.post('/instances/:id/setup/agents/strategy/commit', commitStrategyScenario)
app.post('/instances/:id/setup/agents/ops-brief', generateOpsBrief)
app.get('/instances/:id/setup/agents/ops-brief', getOpsBrief)
app.get('/instances/:id/api-usage', getApiUsage)

// ── Google Ads configuration ──
app.post('/instances/:id/integrations/googleads/save', saveGoogleAdsConfig)
app.get('/instances/:id/integrations/googleads/status', getGoogleAdsConfigStatus)
app.post('/instances/:id/integrations/googleads/disconnect', disconnectGoogleAdsConfig)
// Phase 4.2.1 — campaign-scope picker (filter when account hosts multiple businesses)
app.get('/instances/:id/integrations/googleads/campaigns', listGoogleAdsCampaignsForScope)
app.post('/instances/:id/integrations/googleads/scope', saveGoogleAdsCampaignScope)
// Goal-based bidding objective (max_sales / target_roas / target_cpa) + our recommendation
app.get('/instances/:id/mazhir/bidding-objective', getBiddingObjectiveRecommendation)
app.post('/instances/:id/mazhir/bidding-objective', setBiddingObjectiveEndpoint)
app.post('/instances/:id/setup/agents/research/stage', researchStage)
app.post('/instances/:id/setup/agents/research/summary', researchSummary)
app.post('/instances/:id/setup/agents/strategy/summary', strategySummary)
app.post('/instances/:id/setup/agents/research/reset', resetResearch)
app.post('/instances/:id/setup/agents/strategy/reset', resetStrategy)

// Intent-aware research pipeline (docs/research-pipeline-design.md).
// Phase 2: plan endpoints functional, stage runners are 501 stubs that
// Phase 3 fills in. Legacy /setup/agents/research/* endpoints above stay
// alive until Phase 7 cleanup so the existing UI keeps working.
import { getResearchPlan, setResearchPlan, expandResearchPlan } from '@/controllers/hosting/research/plan'
import { runResearchStage, getResearchStageStatus } from '@/controllers/hosting/research/runStage'
import { getSeoTracking, setSeoTracking, previewSeoTrackingCost, runSeoTrackingNow, generateReportCardNow } from '@/controllers/hosting/seoTracking'
import { researchPreflight } from '@/controllers/hosting/research/preflight'
import { getStageImpact, wipeStageDownstream } from '@/controllers/hosting/research/stageImpact'
import { chooseScenario } from '@/controllers/hosting/research/chooseScenario'
app.get('/instances/:id/research/plan', getResearchPlan)
app.post('/instances/:id/research/plan', setResearchPlan)
app.post('/instances/:id/research/plan/expand', expandResearchPlan)
app.get('/instances/:id/research/preflight', researchPreflight)
app.post('/instances/:id/research/stage/:stageId', runResearchStage)
app.get('/instances/:id/research/stage/:stageId/status', getResearchStageStatus)
// Phase 4.7 — dependency-aware re-run
app.get('/instances/:id/research/stage/:stageId/impact', getStageImpact)
app.post('/instances/:id/research/stage/:stageId/wipe-downstream', wipeStageDownstream)
// Phase 2026.01 — explicit scenario choice (replaces auto-select fallback)
app.post('/instances/:id/research/scenario/choose', chooseScenario)

// DFS credits proxy (Phase 3.6) — Flowmatic-managed master DFS account,
// per-tenant USD-cents balance. memory: project_dfs_proxy.md.
import {
    getCreditsBalance, getCreditsLedger, updateCreditsSettings,
    createTopupCheckoutController,
} from '@/controllers/hosting/credits'
app.get('/instances/:id/credits/balance', getCreditsBalance)
app.get('/instances/:id/credits/ledger', getCreditsLedger)
app.patch('/instances/:id/credits/settings', updateCreditsSettings)
app.post('/instances/:id/credits/topup/checkout', createTopupCheckoutController)
// DFS no-store metering relay (sovereignty Phase 1) — VPS-authenticated proxy to
// the master DFS account. Additive; not wired until execution moves to the VPS.
import { dfsRelay } from '@/controllers/hosting/dfsRelay'
app.post('/instances/:id/dfs/relay', dfsRelay)
app.post('/instances/:id/setup/agents/content-plan/regenerate', regenerateContentPlan)
app.get('/instances/:id/setup/agents/content-plan', getContentPlan)
app.post('/instances/:id/optimization/weekly', generateOptimizationReport)
app.get('/instances/:id/optimization/latest', getLatestOptimizationReport)
app.post('/instances/:id/assets', saveHistoricalAssets)
app.get('/instances/:id/assets', getHistoricalAssets)
app.post('/instances/:id/metrics/collect', collectMetrics)
app.post('/instances/:id/content-plan/items/:itemId/mark-published', markContentPlanItemPublished)
app.post('/instances/:id/content-plan/items/:itemId/archive', archiveContentPlanItem)
app.post('/instances/:id/content-plan/items/:itemId/draft', draftContentPlanItem)
app.get('/instances/:id/paid-profile', getPaidProfile)
app.post('/instances/:id/paid-profile', savePaidProfile)
app.post('/instances/:id/paid-profile/historical-reports', uploadHistoricalReports)
app.post('/instances/:id/mazhir/audit', runMazhirAuditController)
app.get('/instances/:id/mazhir/audit', getMazhirAudit)
app.get('/instances/:id/mazhir/data-preflight', getMazhirDataPreflight)
// Phase 4.2.3-F — tenant state classification (read-only) for UI mode-awareness
app.get('/instances/:id/mazhir/tenant-state', getMazhirTenantState)
// Phase 4.3-B — unified monthly marketing plan (paid + organic + content synthesis)
app.post('/instances/:id/monthly-plan', generateMonthlyPlanController)
app.get('/instances/:id/monthly-plan', getMonthlyPlanController)
// Phase 4.3-C — per-task lifecycle (approve fires executor; reject + skip mutate only)
app.post('/instances/:id/monthly-plan/tasks/:taskId/approve', approveMonthlyTask)
app.post('/instances/:id/monthly-plan/tasks/:taskId/reject', rejectMonthlyTask)
app.post('/instances/:id/monthly-plan/tasks/:taskId/skip', skipMonthlyTask)
// Phase 4.3-N v8: manual-done flow (task done outside the system; unblocks dependsOn chain).
app.post('/instances/:id/monthly-plan/tasks/:taskId/complete', completeMonthlyTaskManually)
// Calendar reschedule — drag-drop a task to another day / change date from the task card.
app.post('/instances/:id/monthly-plan/tasks/:taskId/reschedule', rescheduleMonthlyTask)
app.post('/instances/:id/mazhir/media-plan', generateMazhirMediaPlan)
app.get('/instances/:id/mazhir/media-plan', getMazhirMediaPlan)
app.post('/instances/:id/mazhir/media-plan/approve', approveMazhirMediaPlan)
app.post('/instances/:id/mazhir/media-plan/revise', reviseMazhirMediaPlan)
app.get('/instances/:id/mazhir/media-plan/manual.html', getMazhirMediaPlanManualHtml)
app.get('/instances/:id/agent-feed', getAgentChatFeedController)
app.post('/instances/:id/agent-chat', postAgentChat)
app.get('/instances/:id/mazhir/gtm/targets', listMazhirGtmTargets)
app.post('/instances/:id/mazhir/gtm/target', saveMazhirGtmTarget)
// Phase 4.2.1-M — create new GTM container + retrieve install snippet
app.post('/instances/:id/mazhir/gtm/create-container', createMazhirGtmContainer)
app.get('/instances/:id/mazhir/gtm/snippet', getMazhirGtmInstallSnippet)
app.post('/instances/:id/mazhir/conversions/setup', setupMazhirConversions)
// Phase 4.2.3-B — auto-suggest + user-confirm flow (UI-driven)
app.get('/instances/:id/mazhir/conversions/suggestions', getConversionSuggestions)
app.post('/instances/:id/mazhir/conversions/confirm', confirmConversionMappings)
// Phase 4.3-P(B) — read-only detect-existing flow: scan live Ads ConversionActions,
// match onto our schema, draft mapping → user approves in משימות פעילות → apply.
app.post('/instances/:id/mazhir/conversions/detect-existing', detectExistingConversionActions)
app.post('/instances/:id/mazhir/conversions/apply-mapping', applyConversionMapping)
// Phase 4.3-P(B v2) — rich picker: granular per-row selection from the GTM card.
app.get('/instances/:id/mazhir/conversions/draft', getConversionDraft)
app.post('/instances/:id/mazhir/conversions/apply-selected', applySelectedConversionMapping)
app.post('/instances/:id/mazhir/gtm/auto-setup', autoSetupMazhirGtm)
// Tracking Health card (кабинет indications) — systemic verification suite
app.get('/instances/:id/tracking/health', getTrackingHealth)
// Apply approved Google Ads recommendations (safe 'apply' set or a passed list)
app.post('/instances/:id/ads-recommendations/apply', applyAdsRecommendations)
// Phase 4.2.2-A — GTM integration card diagnostic (probe-based gate status)
app.get('/instances/:id/integrations/gtm/diagnostic', getGtmIntegrationDiagnostic)
// Phase 4.2.2-B — GTM auto-fix orchestrator (single-button chain)
app.post('/instances/:id/integrations/gtm/auto-fix', runGtmAutoFix)
app.get('/instances/:id/mazhir/preflight', getMazhirPreflight)
app.post('/instances/:id/mazhir/execute', executeMazhirPlan)
app.get('/instances/:id/mazhir/wp-snippet', getMazhirWpSnippet)
// One-click auto-install of the GTM snippet (WordPress companion or GitHub PR).
app.post('/instances/:id/mazhir/gtm/install-snippet', installGtmSnippetAuto)
app.get('/instances/:id/mazhir/gtm/conflicts', getTrackingConflicts)
app.post('/instances/:id/mazhir/gtm/resolve-conflict', resolveTrackingConflictHandler)
app.get('/instances/:id/setup-readiness', getSetupReadiness)
app.post('/instances/:id/setup-readiness/audit', runSetupReadinessAuditHandler)
app.post('/instances/:id/mazhir/page-refresh/preview', previewPageRefresh)
app.post('/instances/:id/mazhir/page-refresh/publish', publishPageRefreshDraftHandler)
app.get('/instances/:id/stats', getAgentStats)
app.get('/instances/:id/media/settings', getMediaSettings)
app.post('/instances/:id/media/settings', updateMediaSettings)
app.post('/instances/:id/media/test-generate', testGenerateMedia)
app.get('/instances/:id/content-plan/items/:itemId/media', getContentPlanItemMedia)
app.post('/instances/:id/content-plan/items/:itemId/media/regenerate', regenerateItemMedia)
app.post('/instances/:id/content-plan/media/:renderId/status', updateRenderStatus)
app.post('/instances/:id/content-plan/items/:itemId/media/upload', uploadUserMedia)
app.post('/instances/:id/agents/add', addAgentToInstance)
app.post('/instances/:id/agents/remove', removeAgentFromInstance)
app.post('/instances/:id/agents/reset-config', resetAgentConfig)

// ── Google Ads mode picker (self-managed vs HaaS) ──
app.post('/instances/:id/google-ads-mode', setGoogleAdsMode)
app.post('/instances/:id/google-ads-haas/request-invite', requestHaasMccInvite)

// ── Marketing Hub (intents → integrations → pipelines) ──
app.get('/marketing/catalog', getMarketingCatalog)
app.get('/instances/:id/marketing-intents', getMarketingIntents)
app.post('/instances/:id/marketing-intents', saveMarketingIntents)

// ── Phase 4.1 Layer-3: Paid-track Hypothesis Engine ──
app.post('/instances/:id/paid-hypotheses/run', runPaidHypothesesEngineController)
app.get('/instances/:id/paid-hypotheses', listPaidHypotheses)
app.get('/instances/:id/paid-hypotheses/:hid', getPaidHypothesisById)
app.post('/instances/:id/paid-hypotheses/:hid/approve', approvePaidHypothesisController)
app.post('/instances/:id/paid-hypotheses/:hid/decline', declinePaidHypothesisController)
app.post('/instances/:id/paid-hypotheses/:hid/start-testing', startTestingPaidController)
app.post('/instances/:id/paid-hypotheses/:hid/resolve', resolvePaidHypothesisController)
app.post('/instances/:id/paid-hypotheses/:hid/execute', executePaidHypothesisController)

// ── Phase 4.3: Paid Performance Loop (learner aggregation + injection preview) ──
app.post('/instances/:id/paid-learnings/aggregate', runPaidLearnerAggregation)
app.get('/instances/:id/paid-learnings', listPaidLearnings)
app.get('/instances/:id/paid-learnings/injectable', previewPaidLearningsInjection)

// ── Phase 4.4: Cross-Platform Truth (MER + aMER + per-platform trust) ──
app.get('/instances/:id/cross-platform-truth', getCrossPlatformTruthController)
// Phase 4.3-R — comprehensive onboarding audit (schema-drift + cross-agent +
// ground-truth + integration-coherence + pipeline-health).
app.post('/instances/:id/audit/onboarding', auditOnboarding)
app.get('/instances/:id/audit/onboarding/text', auditOnboardingText)
// Phase 4.3-S — manual "run audit + create task" trigger.
app.post('/instances/:id/audit/run-now', runAuditNow)
app.post('/instances/:id/marketing-intents/preview-cleanup', previewIntentCleanup)
app.get('/instances/:id/integration-hub', getIntegrationHub)
app.post('/instances/:id/integration-hub/preview', previewHubForIntents)
app.post('/instances/:id/integrations/sync', syncIntegrationStates)
app.post('/instances/:id/integrations/:integrationId/state', setIntegrationState)
app.get('/instances/:id/pipelines/:pipelineId/precheck', pipelinePrecheck)
app.post('/instances/:id/pipelines/:pipelineId/activation', setPipelineActivationEndpoint)

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
// Phase 4.3-O: backend WordPress credentials test (bypasses browser CORS / CF WAF).
app.post('/instances/:id/integrations/test-wordpress', testWordpress)

// ── Server ──
app.get('/instances/:id/server-stats', serverStats)  // renamed from /stats — collided with /stats (getAgentStats)
app.get('/instances/:id/logs', serverLogs)
// Phase 4.0(disk) — disk health endpoints
app.get('/instances/:id/disk/breakdown', diskBreakdown)
app.post('/instances/:id/disk/cleanup', diskCleanup)

// ── Backups (Hetzner snapshot-based) ──
app.get('/instances/:id/backups', listBackups)
app.post('/instances/:id/backups/create', createBackup)
app.post('/instances/:id/backups/restore', restoreBackup)
app.delete('/instances/:id/backups/:imageId', deleteBackup)
app.post('/instances/:id/backup-report', backupReport)
app.post('/instances/:id/install-complete', installComplete)

// ── Google Workspace OAuth ──
app.get('/integrations/google/auth', googleAuth)
app.get('/integrations/google/callback', googleCallback)
app.post('/integrations/google/disconnect', googleDisconnect)
app.get('/integrations/google/status', googleStatus)

// ── Google Asset Picker (Phase 4.1) — GA4 properties + GTM containers ──
import {
    listGA4Properties as gapListGA4,
    selectGA4Property as gapSelectGA4,
    listGTMContainers as gapListGTM,
    selectGTMContainer as gapSelectGTM,
} from '@/controllers/hosting/googleAssetPicker'
app.get('/instances/:id/integrations/google/ga4/properties', gapListGA4)
app.post('/instances/:id/integrations/google/ga4/select', gapSelectGA4)
app.get('/instances/:id/integrations/google/gtm/containers', gapListGTM)
app.post('/instances/:id/integrations/google/gtm/select', gapSelectGTM)

// ── Google Search Console OAuth ──
app.get('/integrations/gsc/auth', gscAuth)
app.get('/integrations/gsc/callback', gscCallback)
app.post('/integrations/gsc/disconnect', gscDisconnect)
app.get('/integrations/gsc/status', gscStatus)
app.post('/integrations/gsc/set-site', gscSetSite)

// SEO + AEO tracking (paid DataForSEO add-on; opt-in + per-tenant monthly cap)
app.get('/instances/:id/integrations/seo-tracking', getSeoTracking)
app.post('/instances/:id/integrations/seo-tracking', setSeoTracking)
app.post('/instances/:id/integrations/seo-tracking/forecast', previewSeoTrackingCost)
app.post('/instances/:id/integrations/seo-tracking/run', runSeoTrackingNow)
app.post('/instances/:id/integrations/seo-tracking/report-card', generateReportCardNow)

// ── DataForSEO ──
app.post('/integrations/dataforseo/save', saveDataforseoKey)
app.get('/integrations/dataforseo/status', getDataforseoStatus)
app.post('/integrations/dataforseo/disconnect', removeDataforseoKey)

// ── Firecrawl ──
// Brand Book v2 — full taxonomy + versioning + quality gates
app.post('/instances/:id/brand-v2/start', startBrandV2)
app.get('/instances/:id/brand-v2/draft', getBrandV2Draft)
app.get('/instances/:id/brand-v2/approved', getBrandV2Approved)
app.get('/instances/:id/brand-v2/history', getBrandV2History)
app.patch('/instances/:id/brand-v2/draft', patchBrandV2Draft)
app.post('/instances/:id/brand-v2/upload-asset', uploadBrandAsset)
app.post('/instances/:id/brand-v2/normalize-logo', normalizeBrandLogo)
app.post('/instances/:id/brand-v2/extract-colors', extractColorsFromImage)
app.post('/instances/:id/brand-v2/submit', submitBrandV2)
app.post('/instances/:id/brand-v2/approve', approveBrandV2)
app.post('/instances/:id/brand-v2/discard', discardBrandV2Draft)
app.post('/instances/:id/brand-v2/start-over', startOverBrandV2)
app.post('/instances/:id/brand-v2/edit-approved', editApprovedBrandV2)
app.get('/instances/:id/brand-v2/quality-gates', getBrandV2QualityGates)
// Sprint 3 — website scan
app.post('/instances/:id/brand-v2/scan-website', scanWebsiteForBrandV2)
// Sprint 4 — AI generation
app.post('/instances/:id/brand-v2/generate-logo', generateBrandLogoCandidates)
app.post('/instances/:id/brand-v2/adopt-logo', adoptGeneratedBrandLogo)
app.post('/instances/:id/brand-v2/generate-imagery', generateBrandImagery)
app.post('/instances/:id/brand-v2/generate-voice', generateBrandVoiceFor)
app.post('/instances/:id/brand-v2/generate-personas', generateBrandPersonasFor)
app.post('/instances/:id/brand-v2/generate-palette', generateBrandColorPaletteFor)
// Sprint 6 — exports
app.get('/instances/:id/brand-v2/export.html', exportBrandV2Html)
app.get('/instances/:id/brand-v2/asset-manifest', exportBrandV2AssetManifest)

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
app.post('/instances/:id/shopify', saveShopifyConfig)
app.get('/instances/:id/shopify/status', getShopifyStatus)
app.post('/instances/:id/shopify/test', testShopify)
app.delete('/instances/:id/shopify', disconnectShopify)

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
app.get('/instances/:id/creative/routing',                  getCreativeRouting)
app.post('/instances/:id/creative/routing',                 saveCreativeRouting)

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
app.post('/instances/:id/task-chat',                                taskChat)

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
// Phase 2026.02 Block 6 Pattern F: mark a 'awaiting_manual' task as
// completed after the user finished the manual step (e.g. pasted GTM
// container config, deployed sGTM via Cloud Run, manually adjusted a
// codeless conversion action). Updates agent_outputs.status='completed'
// AND mirrors plan.tasks[idx].status='completed' in research_data.
app.patch('/instances/:id/outputs/:outputId/mark-manual-done', markManualDone)
// Phase 2026.02 Block 6 Pattern G — POST CONTAINER_CONFIG for an
// 'awaiting_manual' sGTM task. SSH-writes /opt/openclaw/sgtm/.env,
// restarts the container, polls /healthy; on 200 → task=completed.
app.post('/instances/:id/outputs/:outputId/sgtm/configure', sgtmConfigure)
// Phase 2026.02 Block 6 Pattern I — create fresh GTM Account + Container.
// Body: { accountName, containerName, siteDomain }. Returns new IDs +
// snippets to install on the site. Used for migration from agency-shared
// accounts AND for greenfield new tenants without any GTM infrastructure.
app.post('/instances/:id/gtm/fresh-stack', gtmFreshStack)
app.get('/instances/:id/gtm/fresh-stack/preflight', gtmFreshStackPreflight)
app.post('/instances/:id/gtm/resolve-conflict', gtmResolveConflict)
app.post('/instances/:id/safety/apply-fix', applySafetyFix)
app.get('/instances/:id/safety/bidding-strategies', listBiddingStrategies)
app.post('/instances/:id/safety/apply-bidding-strategy', applyBiddingStrategy)
app.post('/instances/:id/safety/restore-bidding', restoreBiddingFromHistory)
app.get('/instances/:id/safety/active-actions', listActiveDeferredActions)
app.post('/instances/:id/safety/record-deferred-action', recordDeferredActionEndpoint)
app.post('/instances/:id/safety/restore-deferred-action', restoreDeferredAction)
app.post('/instances/:id/safety/migrate-bidding-history', migrateBiddingHistoryEndpoint)
// Phase 2026.02 Block 6 Pattern J — download Clawflow Companion plugin
// .zip (single-file PHP plugin). User uploads via WP Admin → Plugins →
// Add New → Upload Plugin (~30 sec one-time). After install, fresh-stack
// re-run completes the snippet POST + stale scan auto-flows.
app.get('/instances/:id/wp/companion-plugin.zip', wpCompanionPluginZip)
app.get('/instances/:id/wp/companion-status', getWpCompanionStatus)
app.patch('/instances/:id/outputs/:outputId/reject', rejectOutput)
// K19 — bulk approve / reject N pending_review outputs in one call.
// Body: { outputIds: ["mt_xxx", ...], reason?: string }   max 100
app.post('/instances/:id/outputs/bulk-approve', bulkApproveOutputs)
app.post('/instances/:id/outputs/bulk-reject', bulkRejectOutputs)
// K20 — manual retry for a failed monthly_task. Bypasses cron backoff,
// re-fires the executor immediately. Capped at 3 retries (after which
// an investigate child task already exists).
app.post('/instances/:id/outputs/:outputId/retry-now', retryFailedTaskNow)
// K21 — per-step checklist tracking. Body: { status, note? }
app.post('/instances/:id/outputs/:outputId/steps/:stepIdx/mark-step', markActionStep)
app.patch('/instances/:id/outputs/:outputId/edit', editOutput)
app.patch('/instances/:id/outputs/:outputId/publish', publishOutput)
app.patch('/instances/:id/outputs/:outputId/archive', archiveOutput)
app.delete('/instances/:id/outputs/:outputId', deleteOutput)
app.get('/instances/:id/outputs/:outputId/export', exportOutput)

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