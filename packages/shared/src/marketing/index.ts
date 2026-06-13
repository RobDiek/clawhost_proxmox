// Marketing layer barrel — single import surface for the platform's
// marketing-data fabric (intents, integrations, pipelines, relevance).

export type { MarketingIntent, IntentInfo } from './intents'
export { INTENTS, getIntent, isValidIntent } from './intents'

export type {
    IntegrationCapability,
    AuthMethod,
    IntegrationInfo,
} from './integrations'
export {
    INTEGRATIONS,
    getIntegration,
    listAvailableIntegrations,
} from './integrations'

export type { PipelineId, PipelineDef } from './pipelines'
export { PIPELINES, getPipeline, pipelinesForIntents } from './pipelines'

export type {
    Tier,
    IntegrationRelevance,
    PipelineStatus,
    PreLaunchCheck,
    CapabilityGroup,
    HubGroupView,
    EssentialReadiness,
} from './relevance'
export {
    tierForIntegration,
    relevanceForIntegrations,
    pipelineStatuses,
    checkPipelineLaunch,
    CAPABILITY_GROUP_LABELS_HE,
    groupForIntegration,
    buildHub,
    ALTERNATIVE_GROUPS,
    essentialReadiness,
} from './relevance'

export type { AutoDeriveInput } from './autoDerive'
export { deriveIntents, intentsDiff } from './autoDerive'

export type { AnswersForBridge } from './answersBridge'
export {
    intentsFromAnswers,
    platformsTextFromIntents,
    goalsTextFromIntents,
    tracksFromIntents,
} from './answersBridge'

export type {
    IntegrationConnectionRecord,
    PipelineRun,
    PipelineNamespace,
    MarketingResearchData,
} from './pipelineState'
export {
    readPipelineResult,
    readPipelineRun,
    pipelineHasOutput,
    pipelineNamespacesWithData,
    pipelineStateUpdate,
    readIntegrationConnection,
    listConnectedIntegrationIds,
    autoConnectedIntegrationIds,
    ALWAYS_ON_INTEGRATION_IDS,
} from './pipelineState'
