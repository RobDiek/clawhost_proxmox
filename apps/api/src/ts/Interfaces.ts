import type { ChildProcess } from 'child_process'
import type { ReactNode } from 'react'
import type {
    BillingInterval,
    ClawFileType,
    FeatureEmailKey,
    SubscriptionStatus,
    VersionGatedFeature,
    WebhookEventType
} from '@/ts/Types'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { TranslationKey } from '@openclaw/i18n'

export interface ApiResponse<T = null> {
    success: boolean
    data: T
    message: string
    code: number
    version: string
}

export interface ReadClawConfigFileOptions {
    fallback?: string
    timeout?: number
}

export interface WithClawOptions {
    requireSSH?: boolean | TranslationKey
}

export interface ExportRateLimitData {
    retryAfter: number
}

export interface FeatureGatedConfigUpdateParams {
    ip: string
    rootPassword: string
    feature: VersionGatedFeature
    mutate: (config: Record<string, unknown>) => void | Promise<void>
}

export interface FeatureGatedConfigUpdateResult {
    ok: boolean
    unsupportedVersion?: string
}

export interface CloudProvider {
    createServer(
        name: string,
        serverType: string,
        location: string,
        rootPassword?: string,
        sshKeyIds?: number[],
        snapshotId?: string,
        userData?: string
    ): Promise<CreateServerResult>
    getServer(serverId: string): Promise<ServerStatus>
    getServers(): Promise<Map<string, ServerStatus>>
    startServer(serverId: string): Promise<void>
    stopServer(serverId: string): Promise<void>
    restartServer(serverId: string): Promise<void>
    deleteServer(serverId: string): Promise<void>
    getServerTypes(): Promise<ServerTypeInfo[]>
    getLocations(): Promise<LocationInfo[]>
    getRawServerTypes(): Promise<RawServerType[]>
    getDatacenters(): Promise<DatacenterAvailability[]>
    createSSHKey(name: string, publicKey: string): Promise<CreateSSHKeyResult>
    deleteSSHKey(keyId: number): Promise<void>
    getVolumePricing(): Promise<VolumePricingResult>
    createVolume(
        name: string,
        size: number,
        location: string,
        serverId?: number
    ): Promise<VolumeInfo>
    attachVolume(volumeId: number, serverId: number): Promise<void>
    detachVolume(volumeId: number): Promise<void>
    deleteVolume(volumeId: number): Promise<void>
    getVolume(volumeId: number): Promise<VolumeDetails>
}

export interface RawServerType {
    id: number
    name: string
}

export interface DatacenterAvailability {
    name: string
    locationName: string
    availableServerTypeIds: number[]
}

export interface HetznerServer {
    id: number
    name: string
    status: string
    public_net: {
        ipv4: { ip: string }
    }
}

export interface HetznerSSHKey {
    id: number
    name: string
    fingerprint: string
    public_key: string
    created: string
}

export interface HetznerServerType {
    id: number
    name: string
    description: string
    cores: number
    memory: number
    disk: number
    architecture: string
    prices: Array<{
        location: string
        price_hourly: { gross: string }
        price_monthly: { gross: string }
    }>
}

export interface HetznerLocation {
    id: number
    name: string
    description: string
    country: string
    city: string
}

export interface HetznerDatacenter {
    id: number
    name: string
    location: { name: string }
    server_types: {
        available: number[]
        supported: number[]
    }
}

export interface HetznerVolume {
    id: number
    name: string
    size: number
    location: { name: string }
    server: number | null
    status: string
    created: string
}

export interface HetznerVolumePricing {
    price_per_gb_month: { gross: string }
}

export interface HetznerCreateServerResponse {
    server: HetznerServer
    root_password: string
}

export interface HetznerServersResponse {
    servers: HetznerServer[]
    meta: {
        pagination: { total_entries: number; last_page: number }
    }
}

export interface HetznerServerResponse {
    server: HetznerServer
}

export interface HetznerServerTypesResponse {
    server_types: HetznerServerType[]
}

export interface HetznerLocationsResponse {
    locations: HetznerLocation[]
}

export interface HetznerDatacentersResponse {
    datacenters: HetznerDatacenter[]
}

export interface HetznerSSHKeysResponse {
    ssh_keys: HetznerSSHKey[]
}

export interface HetznerSSHKeyResponse {
    ssh_key: HetznerSSHKey
}

export interface HetznerPricingResponse {
    pricing: { volume: HetznerVolumePricing }
}

export interface HetznerVolumeResponse {
    volume: HetznerVolume
}

export interface ServerStatus {
    status: string
    ip: string
}

export interface CreateServerResult {
    serverId: number
    ip: string
    rootPassword: string
}

export interface ServerTypeInfo {
    name: string
    description: string
    cores: number
    memory: number
    disk: number
    architecture: string
    priceHourly: number
    priceMonthly: number
}

export interface LocationInfo {
    id: string
    name: string
    city: string
    country: string
    disabled: boolean
}

export interface HetznerSSHKeyInfo {
    id: number
    name: string
    fingerprint: string
    publicKey: string
    createdAt: string
}

export interface CreateSSHKeyResult {
    id: number
    name: string
    fingerprint: string
}

export interface VolumeInfo {
    id: number
    size: number
    location: string
}

export interface VolumeDetails {
    id: number
    size: number
    status: string
    serverId: number | null
}

export interface VolumePricingResult {
    pricePerGbMonthly: number
}

export interface CheckoutSession {
    id: string
    url: string
    status: string
    customerId?: string
    customerEmail?: string
    productId: string
    amount: number
    currency: string
    metadata?: Record<string, string>
    subscriptionId?: string
}

export interface CreateCheckoutParams {
    productId: string
    customerEmail: string
    customerId?: string
    successUrl?: string
    cancelUrl?: string
    metadata?: Record<string, string>
}

export interface PolarSubscription {
    id: string
    status: SubscriptionStatus
    customerId: string
    productId: string
    amount: number
    currency: string
    currentPeriodStart?: Date
    currentPeriodEnd?: Date
    cancelAtPeriodEnd: boolean
    canceledAt?: Date
    endedAt?: Date
    metadata?: Record<string, string>
}

export interface PolarSubscriptionRaw {
    id: string
    status: string
    customerId: string
    productId: string
    amount?: number
    currency?: string
    currentPeriodStart?: string
    currentPeriodEnd?: string
    cancelAtPeriodEnd?: boolean
    canceledAt?: string
    endedAt?: string
    metadata?: Record<string, string>
}

export interface PolarOrder {
    id: string
    status: string
    subtotalAmount: number
    discountAmount: number
    totalAmount: number
    taxAmount: number
    currency: string
    billingReason: string
    productName: string | null
    productId: string | null
    subscriptionId: string | null
    discountName: string | null
    createdAt: string
}

export interface PolarOrdersPage {
    items: PolarOrder[]
    totalCount: number
    maxPage: number
}

export interface PolarOrderRaw {
    id: string
    status: string
    amount: number
    subtotalAmount: number
    discountAmount: number
    taxAmount: number
    currency?: string
    billingReason: string
    product?: { name: string; id: string } | null
    productId?: string | null
    subscriptionId?: string | null
    discount?: { name: string } | null
    createdAt: Date | string
}

export interface PolarProduct {
    id: string
    name: string
    description?: string
    isRecurring: boolean
    isArchived: boolean
}

export interface PolarProductPrice {
    priceAmount: number
    priceCurrency: string
}

export interface PolarProductRaw {
    id: string
    name: string
    description?: string | null
    isRecurring: boolean
    isArchived: boolean
    prices?: PolarProductPrice[]
}

export interface CreatePolarProductParams {
    name: string
    description?: string
    priceAmountCents: number
    recurringInterval?: BillingInterval
}

export interface PolarCustomer {
    id: string
    email: string
    name?: string
    externalId?: string
}

export interface CreatePolarCustomerParams {
    email: string
    name?: string
    externalId: string
}

export interface WebhookEvent<T = unknown> {
    type: WebhookEventType
    data: T
}

export interface SubscriptionWebhookData {
    id: string
    status: string
    customerId: string
    customerEmail?: string
    productId: string
    priceId?: string
    amount: number
    currency: string
    currentPeriodStart?: string
    currentPeriodEnd?: string
    cancelAtPeriodEnd: boolean
    canceledAt?: string
    endedAt?: string
    metadata?: Record<string, string>
}

export interface CheckoutWebhookData {
    id: string
    status: string
    customerId?: string
    customerEmail?: string
    productId: string
    subscriptionId?: string
    amount: number
    currency: string
    metadata?: Record<string, string>
}

export interface WebhookHandlers {
    onCheckoutCreated?: (data: CheckoutWebhookData) => Promise<void>
    onCheckoutUpdated?: (data: CheckoutWebhookData) => Promise<void>
    onSubscriptionCreated?: (data: SubscriptionWebhookData) => Promise<void>
    onSubscriptionActive?: (data: SubscriptionWebhookData) => Promise<void>
    onSubscriptionUpdated?: (data: SubscriptionWebhookData) => Promise<void>
    onSubscriptionCanceled?: (data: SubscriptionWebhookData) => Promise<void>
    onSubscriptionRevoked?: (data: SubscriptionWebhookData) => Promise<void>
    onSubscriptionUncanceled?: (data: SubscriptionWebhookData) => Promise<void>
}

export interface ProvisionClawParams {
    pendingClawId: string
    subscriptionId: string
    customerId: string
    productId: string
}

export interface ProvisionClawResponse {
    success: boolean
    clawId?: string
    referralCode?: string | null
    error?: string
}

export interface ClawCleanupData {
    providerServerId: string | null
    subdomain: string | null
}

export interface SendOtpBody {
    email: string
}

export interface VerifyOtpBody {
    email: string
    code: string
}

export interface ResolveCredentialConflictBody {
    accessToken: string
    providerId: string
    email: string
    code: string
}

export interface OtpCodeEmailProps {
    code: string
}

export interface CreateSSHKeyBody {
    name: string
    publicKey: string
}

export interface UpdateProfileBody {
    name?: string
}

export interface InitiateClawPurchaseBody {
    name?: string
    planId: string
    location: string
    password?: string
    sshKeyId?: string
    volumeSize?: number
    priceMonthly: number
    billingInterval?: BillingInterval
}

export interface CloudflareDNSRecord {
    id: string
    name: string
}

export interface CloudflareDNSLookup {
    id: string
    ip: string
}

export interface PrerenderMeta {
    title: string
    description: string
    url: string
    type: string
    image: string
    jsonLd: Record<string, unknown>
    articleMeta?: ArticleMeta
}

export interface ArticleMeta {
    publishedTime: string
    modifiedTime?: string
    author: string
    tags: string[]
}

export interface DiagnosticsStatusResponse {
    service: string
    port: string
    memory: string
}

export interface DiagnosticsLogsResponse {
    logs: string
}

export interface DiagnosticsRepairResponse {
    success: boolean
    message: string
}

export interface ClawFileEntry {
    path: string
    name: string
    fileType: ClawFileType
}

export interface ClawFilesResponse {
    files: ClawFileEntry[]
}

export interface ReadClawFileBody {
    path: string
}

export interface ReadClawFileResponse {
    content: string
    path: string
}

export interface UpdateClawFileBody {
    path: string
    content: string
}

export interface UpdateClawFileResponse {
    success: boolean
    message: string
}

export interface BillingPeriod {
    start?: string
    end?: string
}

export interface DeleteClawResponse {
    scheduled: boolean
    deletionScheduledAt?: string
    claw?: Record<string, unknown>
}

export interface InitiateClawPurchaseResponse {
    checkoutUrl: string
    checkoutId: string
    pendingClawId: string
    expiresAt: string
}

export interface ClawAgent {
    id: string
    name: string
    model: string | null
    status: string
    directory: string | null
}

export interface ClawAgentsResponse {
    agents: ClawAgent[]
    reachable: boolean
}

export interface RawClawConfigAgent {
    id?: string
    name?: string
    model?: string
    status?: string
    workspace?: string
    directory?: string
}

export interface RawClawHubSkillItem {
    slug?: string
    name?: string
    package?: string
    id?: string
    displayName?: string
    version?: string
    currentVersion?: string
    hasUpdate?: boolean
    updateAvailable?: boolean
    latestVersion?: string
}

export interface UpdateClawEnvVarsBody {
    envVars: Record<string, string>
}

export interface GetAgentConfigBody {
    agentId: string
}

export interface UpdateAgentConfigBody {
    agentId: string
    name?: string
    model: string | null
    envVars: Record<string, string>
}

export interface AgentConfigResponse {
    agent: {
        id: string
        name: string
        model: string | null
    }
    envVars: Record<string, string>
    defaultModel: string | null
}

export interface CreateClawAgentBody {
    name: string
    model?: string | null
    envVars?: Record<string, string>
}

export interface DeleteClawAgentBody {
    agentId: string
}

export interface OrderCustomerResult {
    customerId: string
}

export interface PolarPaginatedResult {
    items: unknown[]
    pagination: { totalCount: number; maxPage: number }
}

export interface PolarItemsResult {
    items: unknown[]
}

export interface RegionMeta {
    city: string
    country: string
}

export interface PlanOrder {
    order: string[]
}

export interface ChannelConfig {
    enabled: boolean
    dmPolicy?: string
    allowFrom?: string[]
    botToken?: string
    token?: string
    appToken?: string
    signingSecret?: string
    account?: string
}

export interface ClawChannelsResponse {
    channels: Record<string, ChannelConfig>
}

export interface UpdateClawChannelsBody {
    channels: Record<string, ChannelConfig>
}

export interface WhatsAppPairResponse {
    status: 'started' | 'already_paired'
}

export interface WhatsAppPairStatusResponse {
    status: 'waiting' | 'qr_ready' | 'paired' | 'failed' | 'not_started'
    qr?: string
    log?: string
}

export interface SkillEntryConfig {
    enabled: boolean
    apiKey?: string
    env?: Record<string, string>
    config?: Record<string, unknown>
}

export interface BundledSkillInfo {
    name: string
    enabled: boolean
    description?: string
}

export interface ClawSkillsResponse {
    skills: BundledSkillInfo[]
    entries: Record<string, SkillEntryConfig>
}

export interface UpdateClawSkillsBody {
    entries: Record<string, SkillEntryConfig>
}

export interface AgentSkillInfo {
    name: string
}

export interface GetAgentSkillsBody {
    agentId: string
}

export interface GetAgentSkillsResponse {
    skills: AgentSkillInfo[]
}

export interface UpdateAgentSkillsBody {
    action: 'install' | 'remove'
    skillName: string
}

export interface ClawHubSearchResult {
    slug: string
    name: string
    description: string
    author: string
    version: string
    downloads: number
    tags: string[]
}

export interface ClawHubInstalledSkill {
    slug: string
    name: string
    version: string
    hasUpdate: boolean
    latestVersion?: string
}

export interface BrowseClawHubSkillsQuery {
    query?: string
    limit?: number
    cursor?: string
    agentId?: string
}

export interface ClawHubInstallBody {
    slug: string
    agentId?: string
}

export interface ClawHubRemoveBody {
    slug: string
    agentId?: string
}

export interface ClawHubUpdateBody {
    slug?: string
    all?: boolean
    agentId?: string
}

export interface ClawHubBrowseResponse {
    skills: ClawHubSearchResult[]
}

export interface ClawHubInstalledResponse {
    skills: ClawHubInstalledSkill[]
}

export interface ClawHubUpdatesResponse {
    updates: ClawHubInstalledSkill[]
}

export interface ClawHubAPISearchHit {
    score: number
    slug: string
    displayName: string
    summary: string
    version: string
    updatedAt: string
}

export interface ClawHubAPISkillItem {
    slug: string
    displayName: string
    summary: string
    version: string
    updatedAt: string
    downloads?: number
    author?: string
    tags?: string[]
}

export interface BrowseClawHubSkillsParams {
    query?: string
    limit?: number
    cursor?: string
}

export interface ClawHubBrowseResultPage {
    skills: ClawHubSearchResult[]
    nextCursor: string | null
    hasMore: boolean
}

export interface CacheEntry<T> {
    data: T
    expiry: number
}

export interface AuthCacheData {
    userId: string
    isAdmin: boolean
}

export interface SkillsCacheEntry {
    data: ClawHubSearchResult[]
    expires: number
}

export interface ClawHubAPISkillsPage {
    items: ClawHubAPISkillItem[]
    nextCursor?: string | null
}

export interface AgentIdBody {
    agentId?: string
}

export interface RenameClawBody {
    name: string
}

export interface BindingMatch {
    channel: string
}

export interface Binding {
    agentId: string
    match: BindingMatch
}

export interface ClawBindingsResponse {
    bindings: Binding[]
    channels: Record<string, ChannelConfig>
    agents: Array<{ id: string; name: string }>
}

export interface UpdateClawBindingsBody {
    bindings: Binding[]
}

export interface RootLayoutProps {
    children: React.ReactNode
}

export interface ClawBindingEntry {
    agentId: string
    match: { channel: string }
}

export interface ClawBindingAgent {
    id: string
    name: string
}

export interface GithubEmailEntry {
    primary: boolean
    email: string
}

export interface GenerateSpeechBody {
    text: string
    voice?: string
}

export interface PiperVoice {
    id: string
    name: string
    gender: string
    quality: string
}

export interface PiperModelConfig {
    sampleRate: number
    channels: number
}

export interface PiperSynthesisResult {
    audio: Buffer
    sampleRate: number
    channels: number
}

export interface PiperStreamResult {
    child: ChildProcess
    sampleRate: number
    channels: number
}

export interface NpmRegistryTimeResponse {
    time: Record<string, string>
}

export interface NpmRegistryVersionsResponse {
    'dist-tags': Record<string, string>
    time: Record<string, string>
}

export interface NpmDownloadsResponse {
    downloads: Record<string, number>
}

export interface VersionCheckResult {
    supported: boolean
    version: string
}

export interface InstallVersionBody {
    version: string
}

export interface GithubUserResponse {
    id: number
    name?: string
    login: string
    email?: string
}

export interface GoogleUserinfoResponse {
    email: string
    sub: string
    name?: string
}

export interface JoinWaitlistBody {
    email: string
}

export interface WaitlistStatusResponse {
    joined: boolean
}

export interface FeatureEmailLayoutProps {
    preview: string
    children: ReactNode
}

export interface FeatureEmailDefinition {
    key: FeatureEmailKey
    subject: string
    render: () => ReactNode
}

export interface AffiliateInfoResponse {
    referrals: AffiliateReferralEntry[]
}

export interface GenerateReferralCodeResponse {
    referralCode: string
}

export interface AffiliateReferralEntry {
    id: string
    referredEmail: string
    status: string
    earnedAmount: number
    createdAt: string
}

export interface UpdateReferralCodeBody {
    code: string
}

export interface AdminUserListItem {
    id: string
    email: string
    name: string | null
    role: string
    authMethods: string[] | null
    hasLicense: boolean
    referralCode: string | null
    createdAt: Date
    clawCount: number
    sshKeyCount: number
}

export interface AdminUsersResponse {
    items: AdminUserListItem[]
    total: number
    page: number
    totalPages: number
}

export interface AdminAnalyticsDataPoint {
    date: string
    count: number
}

export interface AnalyticsRangeConfig {
    trunc: string
    offset: string
}

export interface AnalyticsTableConfig {
    key: string
    table: PgTable
    column: string
}

export interface AdminUpdateFields {
    name?: string | null
    referralCode?: string | null
    [key: string]: unknown
}

export interface GitHubFileEntry {
    name: string
}

export interface BlogTopicDiscovery {
    title: string
    angle: string
}

export interface GitHubRefResponse {
    object: { sha: string }
}

export interface GitHubPullRequestResponse {
    html_url: string
}

export interface ServerLifecycleResult {
    success: boolean
    status: string
}

export interface ErrorWithBody {
    body: unknown
}