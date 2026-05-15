export { configureInstance } from './configure'
export { checkout, handleAllpayWebhook, getSubscriptions } from './billing'
export { getInstances, getInstance, getInstanceStatus, restartInstance, deleteInstance, upgradePlan, addStorage, deleteAccount, installComplete } from './instances'
export { adminGetInstances, adminGetRevenue, adminSuspendInstance, adminTerminateInstance } from './admin'
export { submitSupportRequest } from './support'
export { sendOtpHosting, verifyOtpHosting, getMe, updateMyProfile, getMyInstances, setup2fa, verifySetup2fa, verify2fa, disable2fa, acceptTerms } from './auth'
export { checkSubdomain } from './subdomain'
export { setupApiKey, setupTelegram, completeOnboarding, setGoogleAdsMode, requestHaasMccInvite } from './setup'
export { setupAgents, analyzeAnswers, enrichProfile, runResearch, buildStrategy, buildStrategyScenarios, commitStrategyScenario, generateOpsBrief, getOpsBrief, getApiUsage, seedFacts, benchmarkFacts, saveGoogleAdsConfig, getGoogleAdsConfigStatus, researchStage, researchSummary, strategySummary, resetResearch, resetStrategy, regenerateContentPlan, getContentPlan, generateOptimizationReport, getLatestOptimizationReport, saveHistoricalAssets, getHistoricalAssets, collectMetrics, markContentPlanItemPublished, archiveContentPlanItem, getPaidProfile, savePaidProfile, uploadHistoricalReports, runMazhirAuditController, getMazhirAudit, getMazhirDataPreflight, generateMazhirMediaPlan, getMazhirMediaPlanManualHtml, reviseMazhirMediaPlan, getMazhirMediaPlan, approveMazhirMediaPlan, listMazhirGtmTargets, saveMazhirGtmTarget, setupMazhirConversions, autoSetupMazhirGtm, getMazhirPreflight, executeMazhirPlan, getMazhirWpSnippet, getAgentStats, draftContentPlanItem, getMediaSettings, updateMediaSettings, testGenerateMedia, getContentPlanItemMedia, regenerateItemMedia, updateRenderStatus, uploadUserMedia, addAgentToInstance, removeAgentFromInstance, resetAgentConfig, setupPersonalAgent, ensureAgentsRegistered } from './agentSetup'
export { readFile, writeFile, listFiles, fileTree, createFileOrDir, deleteFile, renameFile, deployCustomAgent, saveIntegration, testSmtp, serverStats, serverLogs, diskBreakdown, diskCleanup } from './files'
export { listBackups, createBackup, restoreBackup, deleteBackup, backupReport } from './backup'
export { googleAuth, googleCallback, googleDisconnect, googleStatus } from './google'
export { metaSaveCredentials, metaCallback, metaDisconnect, metaStatus } from './meta'
export { microsoftAuth, microsoftCallback, microsoftDisconnect, microsoftStatus } from './microsoft'
export { getOutputs, getOutput, ingestOutput, approveOutput, rejectOutput, editOutput, publishOutput, archiveOutput, deleteOutput, exportOutput } from './outputs'
export { telegramWebhook } from './telegramWebhook'
export { getMemories, deleteMemory, clearMemories } from './memories'
export { healthReport, getHealthStatus, toggleAutoHeal } from './healthReport'
export { getUsage } from './usage'
export { diagnoseError } from './diagnose'
export { getOllamaStatus, installOllama, pullOllamaModel, deleteOllamaModel } from './ollama'
export { listMcpServers, addMcpServer, removeMcpServer, getMcpCatalog } from './mcp'
export { gscAuth, gscCallback, gscCallbackHandler, gscDisconnect, gscStatus, gscSetSite } from './gsc'
export { saveDataforseoKey, getDataforseoStatus, removeDataforseoKey } from './dataforseo'
export { saveFirecrawlKey, getFirecrawlStatus, removeFirecrawlKey } from './firecrawl'
export {
    startBrandV2, getBrandV2Draft, getBrandV2Approved, getBrandV2History,
    patchBrandV2Draft, uploadBrandAsset, normalizeBrandLogo, extractColorsFromImage,
    submitBrandV2, approveBrandV2, discardBrandV2Draft, startOverBrandV2,
    editApprovedBrandV2, getBrandV2QualityGates,
    scanWebsiteForBrandV2,
    generateBrandLogoCandidates, adoptGeneratedBrandLogo,
    generateBrandImagery, generateBrandVoiceFor, generateBrandPersonasFor, generateBrandColorPaletteFor,
    exportBrandV2Html, exportBrandV2AssetManifest,
} from './brandV2'
export {
    getLatestManifest, getInstanceVersionStatus,
    triggerInstanceUpgrade, getUpgradeProgressEndpoint,
} from './version'
export { saveRedditCredentials, getRedditStatus, disconnectReddit, testReddit } from './reddit'
export { getSchedules, saveSchedules } from './schedules'
export { saveGithubConfig, getGithubStatus, disconnectGithub, publishToGithub, testGithubIntegration } from './github'
export { seoValidate, seoFirstRun, seoStatus } from './seoFirstRun'
export { getMyReferralCode, getMyReferrals, validateReferralCode, activateReferralTrial } from './referrals'
export { saveGbpConfig, getGbpConfig, createGbpPost, getGbpReviews, replyToGbpReview } from './gbp'
export { saveWaConfig, getWaConfigEndpoint, getWaContacts, addWaContact, importWaContacts, optOutWaContact, getWaTemplates, createWaTemplate, submitWaTemplate, refreshWaTemplateStatus, sendWaBroadcast, getWaSends } from './whatsapp'
export { getLitellmStatusEndpoint, setLitellmApiKeyEndpoint, getLitellmUsageEndpoint } from './litellm'
export { deepCrawlCompetitors, getCrawlStatus } from './crawl4ai'
export { uploadKnowledgeDoc, searchKnowledgeEndpoint, listKnowledgeDocs, deleteKnowledgeDoc } from './knowledge'
export { guardScan, guardStatus } from './llmGuard'
export { deployCrewEndpoint, runCrewEndpoint, listCrewsEndpoint } from './crewai'
// Langfuse removed — custom API Usage Tracker covers observability needs
export { listAgentIntegrations, getAgentIntegrationEndpoint, setAgentIntegrationEndpoint, deleteAgentIntegrationEndpoint } from './agentIntegrationRoutes'
export { extractBrand, analyzeLogoEndpoint, draftBrandBook, approveBrandBook, getBrandBook, getBrandBookVersions } from './brand'
export { saveCreativeKeys, getCreativeStatus, disconnectCreativeKey, listCreativeRenders, getCreativeRender, triggerCreativeRender, getCreativeRouting, saveCreativeRouting } from './creative'
export { mineReferences, listReferences, decomposeReferences, deleteReference } from './references'
export {
    attachMapping, listMappings, deleteMapping,
    listPerformance, getRenderPerformance, triggerPerformanceSync,
    listFatigueAlerts, updateFatigueAlert,
} from './performance'
export {
    createHypothesis, listHypotheses, getHypothesis,
    preRegisterHypothesis, addHypothesisVariant, analyzeHypothesisEndpoint, abandonHypothesis,
} from './hypotheses'
export {
    publishToMeta, metaListAdAccounts, metaListCampaigns, metaListAdSets,
    publishToGoogleAds, googleAdsListAccounts, googleAdsListCampaigns, googleAdsListAdGroups,
} from './publishing'
export { triggerWeeklyReport, getLatestWeeklyReport } from './weeklyReport'
export { triggerYotzer } from './yotzerTrigger'
export {
    getMarketingIntents, saveMarketingIntents,
    getIntegrationHub, setIntegrationState, syncIntegrationStates,
    pipelinePrecheck, getMarketingCatalog, previewHubForIntents,
    setPipelineActivationEndpoint, previewIntentCleanup,
} from './marketingHub'
export {
    runPaidHypothesesEngineController, listPaidHypotheses, getPaidHypothesisById,
    approvePaidHypothesisController, declinePaidHypothesisController,
    startTestingPaidController, resolvePaidHypothesisController,
} from './paidHypotheses'
export {
    runPaidLearnerAggregation, listPaidLearnings, previewPaidLearningsInjection,
} from './paidLearner'
export { getCrossPlatformTruthController } from './crossPlatformTruth'
// Twenty CRM removed — AGPLv3 license risk
// export { installTwenty } from './twenty'