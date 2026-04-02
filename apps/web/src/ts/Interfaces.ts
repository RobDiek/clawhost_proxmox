import type { ComponentType, ElementType, ReactNode, RefObject } from 'react'
import type { MotionValue } from 'framer-motion'
import type { User } from 'firebase/auth'
import type { Node, Edge } from '@xyflow/react'
import type { UseQueryResult } from '@tanstack/react-query'
import type { TranslationKey } from '@openclaw/i18n'
import type {
    AdminAnalyticsRange,
    AffiliatePeriod,
    AuthMethod,
    BillingInterval,
    ChatMessageRole,
    ChatMessageStatus,
    ClawAvatarSize,
    ClawStatus,
    DashboardTab,
    GatewayConnectionState,
    Language,
    PlaygroundAgentDetailTab,
    PlaygroundDetailTab,
    ThemeMode,
    ClawFileType,
    ChatSidebarViewMode,
    ChatTypingIndicator,
    CompareFeatureStatus,
    TerminalStatus,
    ToastType,
    UserRole,
    Product,
    ChangelogFeatureType,
    CopiedFieldType
} from '@/ts/Types'

export interface ApiResponse<T = null> {
    success: boolean
    data: T
    message: string
    code: number
    version: string
}

export interface Volume {
    id: string
    name: string
    size: number
    status: string
}

export interface Claw {
    id: string
    name: string
    provider: string
    status: ClawStatus
    ip: string | null
    planId: string
    location: string | null
    rootPassword: string | null
    hasRootPassword: boolean
    sshKeyId: string | null
    providerServerId: string | null
    subdomain: string | null
    gatewayToken: string | null
    subscriptionStatus: string | null
    billingInterval: string | null
    currentPeriodStart: string | null
    currentPeriodEnd: string | null
    volumes?: Volume[]
    ownerEmail?: string | null
    deletionScheduledAt: string | null
    checkoutUrl?: string | null
    createdAt: string
    port?: number
}

export interface VolumePricing {
    pricePerGbMonthly: number
    minSize: number
    maxSize: number
}

export interface Plan {
    id: string
    name: string
    cpu: number
    memory: number
    disk: number
    priceMonthly: number
    priceYearly: number
    architecture: string
    disabled?: boolean
}

export interface PlansResponse {
    plans: Plan[]
    atCapacity: boolean
}

export interface Location {
    id: string
    name: string
    city: string
    country: string
    disabled: boolean
}

export interface SSHKey {
    id: string
    name: string
    fingerprint: string
    publicKey: string
    createdAt: string
}

export interface UserProfile {
    id: string
    email: string
    name: string | null
    role: UserRole
    authMethods: AuthMethod[]
    hasLicense: boolean
    referralCode: string | null
    referralCodeChanged: boolean
    createdAt: string
}

export interface LicenseCheckoutResponse {
    checkoutUrl: string
}

export interface LicenseCardProps {
    hasLicense: boolean
    isPurchasing: boolean
    onPurchase: () => void
}

export interface UserStats {
    clawCount: number
    sshKeyCount: number
    orderCount: number
}

export interface BillingOrder {
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

export interface BillingHistoryResponse {
    items: BillingOrder[]
    total: number
    page: number
    totalPages: number
}

export interface BillingInvoiceResponse {
    url: string
}

export interface ToastData {
    message: string
    type: ToastType
    duration?: number
}

export interface UIState {
    isCreateModalOpen: boolean
    setCreateModalOpen: (open: boolean) => void
    toast: ToastData | null
    showToast: (message: string, type?: ToastType, duration?: number) => void
    hideToast: () => void
    phBannerVisible: boolean
    dismissPhBanner: () => void
}

export interface PreferencesState {
    adminMode: boolean
    setAdminMode: (mode: boolean) => void
    dashboardTab: DashboardTab
    setDashboardTab: (tab: DashboardTab) => void
    theme: ThemeMode
    setTheme: (theme: ThemeMode) => void
    language: Language
    setLanguage: (language: Language) => void
    openLinksWindowed: boolean
    setOpenLinksWindowed: (value: boolean) => void
    chatSidebarView: ChatSidebarViewMode
    setChatSidebarView: (view: ChatSidebarViewMode) => void
    product: Product
    setProduct: (product: Product) => void
}

export interface ChannelsState {
    isPairing: boolean
    setIsPairing: (value: boolean) => void
    pollEnabled: boolean
    setPollEnabled: (value: boolean) => void
    versionUnsupported: boolean
    setVersionUnsupported: (value: boolean) => void
    isWhatsAppPaired: boolean
    setIsWhatsAppPaired: (value: boolean) => void
    isRepairing: boolean
    setIsRepairing: (value: boolean) => void
    initialCheckDone: boolean
    setInitialCheckDone: (value: boolean) => void
    visibleSecrets: Record<string, boolean>
    toggleSecret: (fieldId: string) => void
    resetPairingState: () => void
}

export interface SkillsState {
    pendingSkill: string | null
    setPendingSkill: (value: string | null) => void
    pendingSlug: string | null
    setPendingSlug: (value: string | null) => void
    resetSkillsState: () => void
}

export interface VersionsState {
    installingVersion: string | null
    setInstallingVersion: (value: string | null) => void
    confirmVersion: string | null
    setConfirmVersion: (value: string | null) => void
    resetVersionsState: () => void
}

export interface VariablesState {
    showValues: Record<string, boolean>
    toggleValue: (key: string) => void
    copiedKey: string | null
    setCopiedKey: (value: string | null) => void
    showErrors: boolean
    setShowErrors: (value: boolean) => void
    deleteIndex: number | null
    setDeleteIndex: (value: number | null) => void
    dontAskAgain: boolean
    setDontAskAgain: (value: boolean) => void
    resetVariablesState: () => void
}

export interface ClawHubState {
    pendingSlug: string | null
    setPendingSlug: (value: string | null) => void
    page: number
    setPage: (value: number | ((prev: number) => number)) => void
    resetClawHubState: () => void
}

export interface TerminalState {
    status: TerminalStatus
    setStatus: (
        value: TerminalStatus | ((prev: TerminalStatus) => TerminalStatus)
    ) => void
    showScrollButton: boolean
    setShowScrollButton: (value: boolean) => void
    resetTerminalState: () => void
}

export interface DashboardState {
    selectedClawId: string | null
    setSelectedClawId: (value: string | null) => void
    selectedAgentId: string | null
    setSelectedAgentId: (value: string | null) => void
    selectedAgentClawId: string | null
    setSelectedAgentClawId: (value: string | null) => void
    chatSelectedAgent: ChatSelectedAgent | null
    setChatSelectedAgent: (value: ChatSelectedAgent | null) => void
    chatSettingsClawId: string | null
    setChatSettingsClawId: (value: string | null) => void
    chatAgentTab: PlaygroundAgentDetailTab | null
    setChatAgentTab: (value: PlaygroundAgentDetailTab | null) => void
    playgroundAgentTab: PlaygroundAgentDetailTab | null
    setPlaygroundAgentTab: (value: PlaygroundAgentDetailTab | null) => void
    playgroundClawTab: PlaygroundDetailTab | null
    setPlaygroundClawTab: (value: PlaygroundDetailTab | null) => void
    chatClawTab: PlaygroundDetailTab | null
    setChatClawTab: (value: PlaygroundDetailTab | null) => void
    showCreate: boolean
    setShowCreate: (value: boolean) => void
    preselectedPlanId: string | null
    setPreselectedPlanId: (value: string | null) => void
    createAgentClawId: string | null
    setCreateAgentClawId: (value: string | null) => void
    createAgentClawName: string
    setCreateAgentClawName: (value: string) => void
    resetDashboardState: () => void
}

export interface CachedProfile {
    id: string
    email: string
    name: string | null
    role: UserRole
    authMethods: AuthMethod[]
    hasLicense: boolean
    referralCode: string | null
    referralCodeChanged: boolean
    createdAt: string
}

export interface VerifyOtpResponse {
    customToken: string
}

export interface ResolveCredentialConflictData {
    accessToken: string
    providerId: string
}

export interface AuthContextType {
    user: User | null
    loading: boolean
    cachedProfile: CachedProfile | null
    updateCachedProfile: (data: Partial<CachedProfile>) => void
    sendOtp: (email: string) => Promise<void>
    verifyOtp: (email: string, code: string) => Promise<void>
    signInWithGoogle: () => Promise<void>
    signInWithGithub: () => Promise<void>
    linkGoogle: () => Promise<void>
    linkGithub: () => Promise<void>
    unlinkGoogle: () => Promise<void>
    unlinkGithub: () => Promise<void>
    signOut: () => Promise<void>
    isLocal?: boolean
}

export interface FooterLink {
    label: string
    href: string
    external?: boolean
}

export interface SetupScreenProps {
    onComplete: () => void
}

export interface LogoProps {
    to?: string
}

export interface NavLink {
    label: string
    href: string
    id: string
}

export interface ClawMascotProps {
    className?: string
}

export interface ClawAvatarProps {
    size?: ClawAvatarSize
    className?: string
}

export interface ProviderIconProps {
    provider: string
    className?: string
}

export interface HeaderProps {
    showNavLinks?: boolean
    navLinks?: NavLink[]
    activeSection?: string
}

export interface FeatureItem {
    icon: ElementType
    title: string
    description: string
}

export interface FeaturesGridProps {
    badge: string
    heading: string
    description: string
    features: FeatureItem[]
}

export interface LandingDemoPreviewProps {
    urlOverride?: string
    hideTitleBar?: boolean
}

export interface UserDropdownProps {
    displayName: string
    onSignOut: () => Promise<void>
    onOpen?: () => void
    hideBilling?: boolean
    hideSSHKeys?: boolean
    hideSignOut?: boolean
    footerLinks?: FooterLink[]
    openLinksWindowed?: boolean
    appVersion?: string
}

export interface EmptyStateProps {
    icon: ReactNode
    title: string
    description: string
    actionLabel?: string
    actionIcon?: ReactNode
    onAction?: () => void
}

export interface ErrorStateProps {
    title?: string
    description?: string
    onRetry?: () => void
}

export interface PanelPlaceholderProps {
    icon: ReactNode
    title: string
    description: string
}

export interface VersionUnsupportedProps {
    version: string
    feature: string
    featureKey: string
    onGoToVersions?: () => void
}

export interface PageTitleProps {
    title: string
    description?: string
    image?: string
    url?: string
    type?: string
    noIndex?: boolean
    keywords?: string[]
    publishedAt?: string
    modifiedAt?: string
    author?: string
}

export interface PageHeaderProps {
    title: string
    description?: string
    action?: ReactNode
}

export interface ActionButtonProps {
    onClick: () => void
    label: string
    icon: ReactNode
    size?: 'default' | 'sm' | 'lg'
}

export interface StatusConfig {
    color: string
    bgColor: string
    label: string
    pulse?: boolean
}

export interface CopyableFieldProps {
    label: string
    value: string
    icon?: ReactNode
    secret?: boolean
}

export interface PlanAvailability {
    [planId: string]: string[]
}

export interface CreateClawModalProps {
    plans: Plan[]
    locations: Location[]
    sshKeys: SSHKey[]
    volumePricing?: VolumePricing
    planAvailability?: PlanAvailability
    preselectedPlanId?: string | null
    onClose: () => void
    onNavigateToSSHKeys: () => void
}

export interface LocalCreateClawModalProps {
    onClose: () => void
}

export interface ClawCardActions {
    onStart: () => void
    onShowStopModal: () => void
    onShowRestartModal: () => void
    onShowDeleteModal: () => void
    onCancelDeletion: () => void
    onShowHardDeleteModal: () => void
    onShowDiagnostics: () => void
    onShowLogs: () => void
    onShowConfig: () => void
    onUpdateInstance: () => void
    onShowReinstallModal: () => void
    onShowCredentials: () => void
    onExport: () => void
    onResumeCheckout: () => void
    onCancelPending: () => void
}

export interface ExportRateLimitError extends Error {
    retryAfter: number
}

export interface ClawCredentialsDialogProps {
    clawIp: string
    rootPassword: string | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

export interface ClawCardDropdownMenuProps {
    claw: Claw
    actions: ClawCardActions
    isLoading: boolean
    hasActionItems: boolean
    isScheduledForDeletion: boolean
    isAdmin: boolean
    compact?: boolean
}

export interface ClawCardDialogsProps {
    clawName: string
    showDeleteModal: boolean
    setShowDeleteModal: (open: boolean) => void
    showStopModal: boolean
    setShowStopModal: (open: boolean) => void
    showRestartModal: boolean
    setShowRestartModal: (open: boolean) => void
    showHardDeleteModal: boolean
    setShowHardDeleteModal: (open: boolean) => void
    onDelete: () => void
    onStop: () => void
    onRestart: () => void
    onHardDelete: () => void
    isDeletePending: boolean
    isStopPending: boolean
    isRestartPending: boolean
    isHardDeletePending: boolean
    showReinstallModal: boolean
    setShowReinstallModal: (open: boolean) => void
    onReinstall: () => void
    isReinstallPending: boolean
}

export interface SSHKeyCardProps {
    sshKey: SSHKey
}

export interface CreateSSHKeyModalProps {
    onClose: () => void
}

export interface GeneratedKeyPair {
    publicKey: string
    privateKey: string
}

export interface GoWaitlistFormProps {
    user: User | null
    authLoading: boolean
    hasJoined: boolean
    isJoining: boolean
    isCheckingStatus: boolean
    waitlistEmail: string
    isValidEmail: boolean
    onWaitlistEmailChange: (value: string) => void
    onJoinWaitlist: (email: string) => void
    onEmailSubmit: (e: React.FormEvent) => void
    loggedInClassName?: string
    guestClassName?: string
}

export interface SSHKeyUploadFormProps {
    name: string
    publicKey: string
    copied: CopiedFieldType
    isPending: boolean
    onNameChange: (value: string) => void
    onPublicKeyChange: (value: string) => void
    onCopyToClipboard: (
        text: string,
        type: NonNullable<CopiedFieldType>
    ) => void
    onSubmit: () => void
    onClose: () => void
}

export interface SSHKeyGenerateFormProps {
    name: string
    generatedKeys: GeneratedKeyPair | null
    copied: CopiedFieldType
    isPending: boolean
    onNameChange: (value: string) => void
    onGenerateKeyPair: () => void
    onCopyToClipboard: (
        text: string,
        type: NonNullable<CopiedFieldType>
    ) => void
    onDownloadPrivateKey: () => void
    onSubmit: () => void
    onClose: () => void
}

export interface ProtectedRouteProps {
    children: ReactNode
}

export interface LicenseGateProps {
    children: ReactNode
}

export interface AuthProviderProps {
    children: ReactNode
}

export interface AIModelOption {
    id: string
    name: string
    provider: string
    envVar: string
}

export interface CreateClawData {
    name: string
    planId: string
    location: string
    password?: string
    sshKeyId?: string
    volumeSize?: number
}

export interface PurchaseClawData {
    name: string
    planId: string
    location: string
    password?: string
    sshKeyId?: string
    volumeSize?: number
    priceMonthly: number
    billingInterval?: 'month' | 'year'
}

export interface DeleteClawResponse {
    scheduled: boolean
    deletionScheduledAt?: string
    claw?: Claw
}

export interface PurchaseClawResponse {
    checkoutUrl: string
    checkoutId: string
    pendingClawId: string
    expiresAt: string
}

export interface RenameClawData {
    name: string
}

export interface UpdateClawSubdomainData {
    subdomain: string
}

export interface CreateSSHKeyData {
    name: string
    publicKey: string
}

export interface UpdateProfileData {
    name?: string
}

export interface CustomerPortalResponse {
    url: string
}

export interface GitHubStarsData {
    count: number
    formatted: string
}

export interface BlogPostFrontmatter {
    title: string
    slug: string
    description: string
    author: string
    publishedAt: string
    updatedAt?: string
    tags: string[]
    coverImage?: string
}

export interface BlogPostMeta extends BlogPostFrontmatter {
    readingTime: number
}

export interface BlogPostModule {
    default: ComponentType
    frontmatter: BlogPostFrontmatter
}

export interface BlogCardProps {
    post: BlogPostMeta
}

export interface JsonLdProps {
    data: Record<string, unknown>
}

export interface PrerenderMeta {
    title: string
    description: string
    url: string
    type: string
    image: string
    jsonLd?: Record<string, unknown>
    articleMeta?: ArticleMeta
}

export interface ArticleMeta {
    publishedTime: string
    modifiedTime?: string
    author: string
    tags: string[]
}

export interface ClawVersionResponse {
    version: string
}

export interface OpenClawVersionEntry {
    version: string
    publishedAt: string
    downloads: number
}

export interface ClawVersionsResponse {
    currentVersion: string
    latestVersion: string
    versions: OpenClawVersionEntry[]
}

export interface InstallClawVersionResponse {
    version: string
}

export interface PlaygroundVersionsContentProps {
    clawId: string
}

export interface ClawCredentialsResponse {
    rootPassword: string | null
    ip: string | null
}

export interface DiagnosticsStatusResponse {
    service: string
    port: string
    memory: string
}

export interface DiagnosticsLogsResponse {
    logs: string
}

export interface ClawFileEntry {
    path: string
    name: string
    fileType: ClawFileType
}

export interface ClawFilesResponse {
    files: ClawFileEntry[]
}

export interface ReadClawFileResponse {
    content: string
    path: string
}

export interface UpdateClawFileData {
    path: string
    content: string
}

export interface UpdateClawFileParams {
    id: string
    data: UpdateClawFileData
}

export interface ClawDiagnosticsDialogProps {
    clawId: string
    open: boolean
    onOpenChange: (open: boolean) => void
}

export interface ClawLogsDialogProps {
    clawId: string
    open: boolean
    onOpenChange: (open: boolean) => void
}

export interface ClawLogsContentProps {
    clawId: string
    enabled: boolean
    embedded?: boolean
    mockLogs?: string
}

export interface ParsedLogLine {
    time: string | null
    text: string
}

export interface ClawTerminalContentProps {
    clawId: string
    enabled: boolean
}

export interface ClawDiagnosticsContentProps {
    clawId: string
    enabled: boolean
    mockData?: DiagnosticsStatusResponse
}

export interface ClawFileExplorerDialogProps {
    clawId: string
    open: boolean
    onOpenChange: (open: boolean) => void
}

export interface UseProfileOptions {
    enabled?: boolean
    staleTime?: number
    refetchInterval?: number | false
}

export interface UseClawOptions {
    sync?: boolean
}

export interface Testimonial {
    quote: string
    author: string
    role: string
    avatar: string
}

export interface Faq {
    question: string
    answer: string
}

export interface FaqSectionProps {
    badge: string
    heading: string
    description: string
    faqs: Faq[]
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

export interface PlaygroundClawNodeData {
    claw: Claw
    agentCount: number
    isLoadingAgents: boolean
    isSelected: boolean
    readOnly?: boolean
}

export interface PlaygroundAgentNodeData {
    agent: ClawAgent
    clawName: string
    clawId: string
    isSelected: boolean
    subdomain: string | null
    gatewayToken: string | null
}

export interface PlaygroundClawNodeProps {
    data: PlaygroundClawNodeData
}

export interface PlaygroundAgentNodeProps {
    data: PlaygroundAgentNodeData
}

export interface PlaygroundCanvasProps {
    initialNodes: Node[]
    initialEdges: Edge[]
    onNodeClick?: (clawId: string) => void
    onAgentClick?: (agentId: string, clawId: string) => void
    onPaneClick?: () => void
    panelOpen?: boolean
    selectedClawId?: string | null
    selectedAgentId?: string | null
    selectedAgentClawId?: string | null
    initialZoom?: number
    allowPageScroll?: boolean
}

export interface PlaygroundCanvasInnerProps extends PlaygroundCanvasProps {
    zoom: number
    onZoomChange: (zoom: number) => void
    isFitView: boolean
    onFitViewChange: (value: boolean) => void
}

export interface PlaygroundDetailPanelProps {
    claw: Claw
    plans: Plan[]
    sshKeys: SSHKey[]
    onClose: () => void
    readOnly?: boolean
    initialTab?: PlaygroundDetailTab
    onTabChange?: (tab: PlaygroundDetailTab) => void
    fullScreen?: boolean
}

export interface PlaygroundDetailInfoTabProps {
    claw: Claw
    plans: Plan[]
    sshKeys: SSHKey[]
    fullScreen?: boolean
    showVersion: boolean
    versionLoading: boolean
    versionDisplay: string | null
}

export interface PlaygroundDetailSettingsTabProps {
    settingsName: string
    settingsNameError: string
    settingsSubdomain: string
    settingsSubdomainError: string
    settingsHasChanges: boolean
    renamePending: boolean
    subdomainPending: boolean
    onNameChange: (value: string) => void
    onSubdomainChange: (value: string) => void
    onSave: () => void
}

export interface PlaygroundToolbarProps {
    zoom: number
    onFitView: () => void
    isFitView: boolean
    nodesOutOfView: boolean
    clawCount: number
}

export interface LanguageOption {
    value: Language
    label: string
    flag: string
}

export interface AgentConfigSummary {
    id: string
    name: string
    model: string | null
}

export interface AgentConfigResponse {
    agent: AgentConfigSummary
    envVars: Record<string, string>
    defaultModel: string | null
}

export interface UpdateAgentConfigData {
    agentId: string
    name?: string
    model: string | null
    envVars: Record<string, string>
}

export interface CreateAgentData {
    name: string
    model?: string | null
    envVars?: Record<string, string>
}

export interface CreateAgentResponse {
    agent: ClawAgent
}

export interface DeleteAgentData {
    agentId: string
}

export interface CreateAgentModalProps {
    clawId?: string
    clawName?: string
    clawsWithAgents?: ClawWithAgents[]
    open: boolean
    onOpenChange: (open: boolean) => void
}

export interface PlaygroundAgentDetailPanelProps {
    agent: ClawAgent
    clawId: string
    clawName: string
    isOnlyAgent: boolean
    onClose: () => void
    readOnly?: boolean
    gatewayToken?: string | null
    subdomain?: string | null
    initialTab?: PlaygroundAgentDetailTab
    onTabChange?: (tab: PlaygroundAgentDetailTab) => void
    hideChatTab?: boolean
    onGoToVersions?: () => void
}

export interface AgentDetailHeaderProps {
    agent: ClawAgent
    clawName: string
    isOnlyAgent: boolean
    isExpanded: boolean
    isDeleting: boolean
    readOnly?: boolean
    hideChatTab?: boolean
    activeTab: PlaygroundAgentDetailTab
    onToggleExpand: () => void
    onDeleteClick: () => void
    onClose: () => void
}

export interface AgentDetailConfigTabProps {
    agent: ClawAgent
    clawId: string
    configData: AgentConfigResponse | undefined
    isConfigLoading: boolean
    isConfigError: boolean
    readOnly?: boolean
}

export interface AgentDeleteDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    agentName: string
    onConfirm: (skipFuture: boolean) => void
}

export interface ClawEnvVarsResponse {
    envVars: Record<string, string>
}

export interface UpdateClawEnvVarsData {
    envVars: Record<string, string>
}

export interface PlaygroundVariablesContentProps {
    clawId: string
    mockEnvVars?: Record<string, string>
}

export interface HeroButtonsProps {
    deployLabel: string
    githubLabel: string
    showStars: boolean
    large?: boolean
}

export interface StatItem {
    value: string
    label: string
}

export interface StatsRowProps {
    stats: StatItem[]
}

export interface HeroBadgeProps {
    label: string
    tutorialBadge?: boolean
    onTutorialClick?: () => void
}

export interface HeroTitleProps {
    line1: string
    line2: string
    description: string
}

export interface DemoPreviewSectionProps {
    previewRef: RefObject<HTMLDivElement>
    previewScale: MotionValue<number>
}

export interface MacosDesktopPreviewProps {
    previewRef: RefObject<HTMLDivElement>
    previewScale: MotionValue<number>
}

export interface GoPricingCardProps {
    price: string
    label: string
    features: string[]
}

export interface SelfHostButtonProps {
    label: string
    showStars?: boolean
    large?: boolean
    className?: string
}

export interface LandingCTAProps {
    title: string
    description: string
    children: ReactNode
}

export interface VideoModalProps {
    open: boolean
    onClose: () => void
    videoUrl: string
}

export interface PricingSectionProps {
    plans: Plan[] | undefined
    plansLoading: boolean
    allDoneLoading: boolean
}

export interface SimplePlanFeature {
    label: string
    included: boolean
}

export interface SimplePlanCardProps {
    name: string
    description: string
    price: number
    yearlyPerMonth: number
    planId: string
    popular?: boolean
    features: SimplePlanFeature[]
}

export interface PlaygroundTabConfig<T extends string = string> {
    id: T
    label: string
    icon: ElementType
}

export interface DemoPlaygroundData {
    nodes: Node[]
    edges: Edge[]
    claws: Claw[]
    agentsByClawId: Record<string, ClawAgent[]>
}

export interface ChatHistoryEntry {
    role: string
    content: unknown
}

export interface ChatImageSource {
    type: string
    mediaType: string
    data: string
    filename?: string
}

export interface ChatMessage {
    id: string
    role: ChatMessageRole
    content: string
    status: ChatMessageStatus
    runId?: string
    timestamp?: string
    images?: ChatImageSource[]
}

export interface RawChatMessage {
    content?: string | unknown[]
    text?: string
}

export interface RawChatChoice {
    message?: RawChatMessage
    delta?: RawChatMessage
}

export interface RawChatContentObject {
    content?: string | unknown[]
    text?: string
    choices?: RawChatChoice[]
}

export interface ChatEventPayload {
    runId: string
    sessionKey: string
    seq: number
    state: 'delta' | 'final' | 'aborted' | 'error'
    message?: unknown
    errorMessage?: string
}

export interface ChatAttachment {
    type: string
    source: ChatImageSource
}

export interface ChatLightboxProps {
    image: ChatImageSource
    fileName?: string
    onClose: () => void
}

export interface ChatSendParams {
    sessionKey: string
    message: string
    idempotencyKey: string
    deliver: boolean
    attachments?: ChatAttachment[]
}

export interface ChatHistoryParams {
    sessionKey: string
    limit: number
}

export interface ChatAbortParams {
    sessionKey: string
    runId: string
}

export interface UseAgentChatParams {
    subdomain: string | null | undefined
    gatewayToken: string | null | undefined
    agentId: string
    enabled: boolean
}

export interface UseAgentChatReturn {
    messages: ChatMessage[]
    connectionState: GatewayConnectionState
    isLoading: boolean
    isStreaming: boolean
    typingIndicator: ChatTypingIndicator
    sendMessage: (
        text: string,
        attachments?: ChatAttachment[],
        previews?: ChatImageSource[]
    ) => void
    abortResponse: () => void
}

export interface GatewayPendingRequest {
    resolve: (payload: unknown) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
}

export interface GatewaySession {
    key?: string
    sessionKey?: string
}

export interface GatewaySessionsResult {
    sessions?: GatewaySession[]
}

export interface GatewayHistoryResult {
    messages?: ChatHistoryEntry[]
    history?: ChatHistoryEntry[]
}

export interface AgentChatProps {
    agentId: string
    agentName?: string
    clawId: string
    subdomain: string | null | undefined
    gatewayToken: string | null | undefined
    agentModel: string | null
    readOnly?: boolean
    onConfigure?: () => void
    configureDisabled?: boolean
    onConnectionStateChange?: (state: GatewayConnectionState) => void
}

export interface ChatBubbleProps {
    message: ChatMessage
    onSpeak?: (messageId: string, text: string) => void
    onStop?: () => void
    isSpeaking?: boolean
    isLoading?: boolean
}

export interface ChatTypingIndicatorProps {
    state: ChatTypingIndicator
}

export interface UseTextToSpeechReturn {
    activeMessageId: string | null
    loadingMessageId: string | null
    speak: (messageId: string, text: string) => void
    stop: () => void
    setOutputDeviceId: (deviceId: string | null) => void
}

export interface ChatSpeechButtonProps {
    messageId: string
    text: string
    isSpeaking: boolean
    isLoading: boolean
    onSpeak: (messageId: string, text: string) => void
    onStop: () => void
}

export interface ChatInputAttachment {
    file: File
    preview: string
}

export interface ChatInputHandle {
    addFiles: (files: File[]) => void
}

export interface ChatInputProps {
    isConnected: boolean
    isStreaming: boolean
    isProcessing: boolean
    onSend: (
        text: string,
        attachments?: ChatAttachment[],
        previews?: ChatImageSource[]
    ) => void
    onAbort: () => void
    allowAttach?: boolean
    onVoiceMode?: () => void
}

export interface VoiceModeOverlayProps {
    onClose: () => void
    messages: ChatMessage[]
    sendMessage: (text: string) => void
    isStreaming: boolean
    typingIndicator: ChatTypingIndicator
    speak: (messageId: string, text: string) => void
    stopSpeech: () => void
    ttsActiveMessageId: string | null
    ttsLoadingMessageId: string | null
    setOutputDeviceId: (deviceId: string | null) => void
}

export interface VoiceOrbProps {
    intensity: number
    size?: number
}

export interface ChatMarkdownProps {
    content: string
}

export interface ChatDateSeparatorProps {
    date: string
}

export interface ChatEmptyStateProps {
    isError: boolean
}

export interface ChatStatusBarProps {
    connectionState: GatewayConnectionState
}

export interface UseSpeechRecognitionReturn {
    isRecording: boolean
    isTranscribing: boolean
    toggle: () => void
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

export interface UpdateClawChannelsData {
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

export interface UpdateClawSkillsData {
    entries: Record<string, SkillEntryConfig>
}

export interface AgentSkillInfo {
    name: string
}

export interface GetAgentSkillsResponse {
    skills: AgentSkillInfo[]
}

export interface UpdateAgentSkillsData {
    action: 'install' | 'remove'
    skillName: string
}

export interface PlaygroundChannelsContentProps {
    clawId: string
    onGoToVersions?: () => void
}

export interface ChannelMetaEntry {
    icon: ElementType
    label: TranslationKey
}

export interface ChannelConfigWithApplicationId extends ChannelConfig {
    applicationId?: string
}

export interface ChannelDefinition {
    key: string
    label: TranslationKey
    icon: ElementType
    fields: ChannelFieldDefinition[]
}

export interface ChannelFieldOption {
    value: string
    label: TranslationKey
}

export interface ChannelFieldDefinition {
    key: keyof ChannelConfig
    label: TranslationKey
    placeholder: TranslationKey
    required?: boolean
    secret?: boolean
    type?: 'text' | 'select'
    options?: ChannelFieldOption[]
}

export interface PlaygroundSkillsContentProps {
    clawId: string
    agentId?: string
    onGoToVersions?: () => void
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

export interface ClawHubBrowseResponse {
    skills: ClawHubSearchResult[]
    nextCursor: string | null
    hasMore: boolean
}

export interface ClawHubInstalledResponse {
    skills: ClawHubInstalledSkill[]
}

export interface ClawHubUpdatesResponse {
    updates: ClawHubInstalledSkill[]
}

export interface BrowseClawHubData {
    query?: string
    limit?: number
    cursor?: string
    agentId?: string
}

export interface ClawHubSkillActionData {
    slug: string
    agentId?: string
}

export interface ClawHubUpdateData {
    slug?: string
    all?: boolean
    agentId?: string
}

export interface PlaygroundClawHubContentProps {
    clawId: string
    agentId?: string
}

export interface ChatSidebarItemProps {
    agent: ClawAgent
    isActive: boolean
    isLast: boolean
    isChecking?: boolean
    connectionState?: GatewayConnectionState
    readOnly?: boolean
    onClick: () => void
    onConfigure: () => void
}

export interface ChatSelectedAgent {
    agentId: string
    clawId: string
}

export interface ClawWithAgents {
    claw: Claw
    agents: ClawAgent[]
    isLoading: boolean
    isReachable: boolean
}

export interface ChatSidebarProps {
    clawsWithAgents: ClawWithAgents[]
    selectedAgent: ChatSelectedAgent | null
    configAgent: ChatSelectedAgent | null
    selectedClawId: string | null
    activeConnectionState?: GatewayConnectionState
    readOnly?: boolean
    onAgentSelect: (selection: ChatSelectedAgent) => void
    onConfigureAgent: (agentId: string, clawId: string) => void
    onCreateAgent: (clawId: string, clawName: string) => void
    onOpenClawSettings: (clawId: string) => void
    onClose?: () => void
}

export interface ChatSidebarTreeViewProps {
    clawsWithAgents: ClawWithAgents[]
    selectedAgent: ChatSelectedAgent | null
    selectedClawId: string | null
    activeConnectionState?: GatewayConnectionState
    readOnly?: boolean
    onAgentClick: (agentId: string, clawId: string) => void
    onConfigureAgent: (agentId: string, clawId: string) => void
    onCreateAgent: (clawId: string, clawName: string) => void
    onOpenClawSettings: (clawId: string) => void
}

export interface ChatSidebarListViewProps {
    clawsWithAgents: ClawWithAgents[]
    selectedAgent: ChatSelectedAgent | null
    configAgent: ChatSelectedAgent | null
    activeConnectionState?: GatewayConnectionState
    readOnly?: boolean
    onAgentClick: (agentId: string, clawId: string) => void
    onConfigureAgent: (agentId: string, clawId: string) => void
}

export interface ChatSidebarListItemProps {
    agentId: string
    agentName: string
    agentModel: string | null
    agentStatus: string
    clawId: string
    clawName: string
    clawSubdomain: string | null
    clawGatewayToken: string | null
    isReachable: boolean
    isActive: boolean
    activeConnectionState?: GatewayConnectionState
    readOnly?: boolean
    onClick: () => void
    onConfigure: () => void
}

export interface ChatSidebarAgentListProps {
    claw: Claw
    agents: ClawAgent[]
    isLoading: boolean
    isReachable: boolean
    selectedAgent: ChatSelectedAgent | null
    activeConnectionState?: GatewayConnectionState
    readOnly?: boolean
    onAgentClick: (agentId: string, clawId: string) => void
    onConfigureAgent: (agentId: string, clawId: string) => void
    onCreateAgent: (clawId: string, clawName: string) => void
}

export interface ChatSidebarClawHeaderProps {
    claw: Claw
    agentCount: number
    isLoadingAgents: boolean
    isReachable: boolean
    isSelected: boolean
    statusConfig: StatusConfig
    readOnly?: boolean
    onOpenClawSettings: (clawId: string) => void
    onCreateAgent: (clawId: string, clawName: string) => void
}

export interface ChatViewProps {
    claws: Claw[]
    agentQueries: UseQueryResult<ClawAgentsResponse>[]
    plans: Plan[]
    sshKeys: SSHKey[]
    selectedAgent: ChatSelectedAgent | null
    onAgentSelect: (selection: ChatSelectedAgent | null) => void
    onConfigureAgent: (agentId: string, clawId: string) => void
    onCreateAgent: (clawId: string, clawName: string) => void
    initialSettingsClawId?: string | null
    onSettingsClawChange?: (clawId: string | null) => void
    initialAgentTab?: PlaygroundAgentDetailTab
    onAgentTabChange?: (tab: PlaygroundAgentDetailTab | null) => void
    initialClawTab?: PlaygroundDetailTab
    onClawTabChange?: (tab: PlaygroundDetailTab | null) => void
}

export interface TruncateTooltipProps {
    content: string
    children: ReactNode
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

export interface UpdateClawBindingsData {
    bindings: Binding[]
}

export interface PlaygroundBindingsContentProps {
    clawId: string
    agentId: string
    onGoToVersions?: () => void
}

export interface CompareData {
    competitors: CompareCompetitor[]
    categories: CompareCategory[]
}

export interface CompareCompetitor {
    id: string
    nameKey: string
    highlighted: boolean
}

export interface CompareFeatureValue {
    status: CompareFeatureStatus
    detailKey?: string
}

export interface CompareFeature {
    nameKey: string
    values: Record<string, CompareFeatureValue>
}

export interface CompareCategory {
    id: string
    nameKey: string
    features: CompareFeature[]
}

export interface ElectronAPI {
    isDesktop?: boolean
    getAppVersion: () => Promise<string>
    openExternal: (url: string) => Promise<void>
    openWindowed: (url: string) => Promise<void>
    checkNetwork: () => Promise<'online' | 'unstable' | 'offline'>
    getDnsStatus: () => Promise<boolean>
    setupDns: () => Promise<boolean>
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
}

export interface ScrollToBottomButtonProps {
    visible: boolean
    onClick: () => void
    className?: string
}

export interface UseScrollToBottomOptions {
    threshold?: number
}

export interface ElectronWindow {
    electronAPI?: ElectronAPI
}

export interface OAuthWindowResult {
    accessToken: string | null
    idToken: string | null
    code: string | null
}

export interface RenameClawMutationParams extends RenameClawData {
    id: string
}

export interface UpdateClawSubdomainMutationParams extends UpdateClawSubdomainData {
    id: string
}

export interface SelectContextValue {
    value: string
    onValueChange: (value: string) => void
    displayText: string
    setDisplayText: (text: string) => void
}

export interface SelectProps {
    value: string
    onValueChange: (value: string) => void
    children: ReactNode
    disabled?: boolean
    displayValue?: string
}

export interface SelectTriggerProps {
    placeholder?: string
    className?: string
    icon?: ReactNode
    disabled?: boolean
}

export interface SelectContentProps {
    children: ReactNode
    className?: string
    align?: 'start' | 'center' | 'end'
}

export interface SelectItemProps {
    value: string
    children: ReactNode
    className?: string
}

export interface SelectGroupProps {
    label: string
    children: ReactNode
    isLast?: boolean
}

export interface EnvVar {
    key: string
    value: string
}

export interface EnvVarValidationError {
    key: string | null
    value: string | null
}

export interface FirebaseErrorLike {
    code?: string
}

export interface ErrorWithMessage {
    message: unknown
}

export interface ErrorResponse {
    error?: string
}

export interface TranscriptionResult {
    text: string
}

export interface AudioContextWithSinkId extends AudioContext {
    setSinkId(id: string): Promise<void>
}

export interface SitemapRoute {
    path: string
    priority: string
    changefreq: string
}

export interface ComparisonRow {
    us: string
    others: string
}

export interface WaitlistStatusResponse {
    joined: boolean
}

export interface JoinWaitlistResponse {
    joined: boolean
    alreadyJoined: boolean
}

export interface ComparisonTableProps {
    badge: string
    heading: string
    description: string
    rows: ComparisonRow[]
    showFullComparisonLink?: boolean
    logoSuffix?: string
}

export interface LocationSelectorProps {
    locations: Location[]
    location: string
    planId: string
    atCapacity: boolean
    isLoading: boolean
    isLocationAvailableForPlan: (locationId: string, planId: string) => boolean
    onLocationChange: (location: string) => void
    onPlanChange: (planId: string) => void
    plans: Plan[]
    isPlanAvailable: (id: string) => boolean
}

export interface BillingIntervalSelectorProps {
    billingCycle: BillingInterval
    onBillingCycleChange: (cycle: BillingInterval) => void
}

export interface PlanSelectorProps {
    plans: Plan[]
    planId: string
    location: string
    billingCycle: BillingInterval
    isLoading: boolean
    preselectedPlanId?: string | null
    isLocationAvailableForPlan: (locationId: string, planId: string) => boolean
    isPlanAvailable: (id: string) => boolean
    onPlanChange: (planId: string) => void
    onLocationChange: (location: string) => void
    getFirstAvailableLocation: (planId: string) => string
}

export interface AdvancedOptionsProps {
    showAdvanced: boolean
    onToggleAdvanced: () => void
    password: string
    onPasswordChange: (password: string) => void
    showPassword: boolean
    onToggleShowPassword: () => void
    sshKeys: SSHKey[]
    selectedSshKeyId: string
    onSshKeyChange: (id: string) => void
    onNavigateToSSHKeys: () => void
    volumePricing?: VolumePricing
    volumeSize: number
    onVolumeSizeChange: (size: number) => void
}

export interface OrderSummaryProps {
    selectedPlan: Plan
    name: string
    location: string
    locations: Location[]
    billingCycle: BillingInterval
    volumeSize: number
    volumePricing?: VolumePricing
}

export interface AffiliatePaymentEntry {
    id: string
    referredEmail: string
    amount: number
    type: string
    createdAt: string
}

export interface AffiliateInfo {
    referralCount: number
    totalEarnings: number
    payments: AffiliatePaymentEntry[]
}

export interface GenerateReferralCodeResponse {
    referralCode: string
}

export interface UpdateReferralCodeData {
    code: string
}

export interface UpdateReferralCodeResponse {
    referralCode: string
}

export interface AdminUserListItem {
    id: string
    email: string
    name: string | null
    role: string
    authMethods: string[]
    hasLicense: boolean
    referralCode: string | null
    createdAt: string
    clawCount: number
    sshKeyCount: number
}

export interface AdminUsersResponse {
    items: AdminUserListItem[]
    total: number
    page: number
    totalPages: number
}

export interface AdminUserDetailClaw {
    id: string
    name: string
    provider: string
    status: string
    ip: string | null
    planId: string
    location: string | null
    subdomain: string | null
    subscriptionStatus: string | null
    billingInterval: string | null
    deletionScheduledAt: string | null
    createdAt: string
}

export interface AdminUserDetailSSHKey {
    id: string
    name: string
    fingerprint: string
    createdAt: string
}

export interface AdminUserDetailVolume {
    id: string
    name: string
    size: number
    location: string
    status: string
    createdAt: string
}

export interface AdminUserDetail {
    id: string
    email: string
    name: string | null
    role: string
    authMethods: string[]
    hasLicense: boolean
    polarCustomerId: string | null
    referralCode: string | null
    referralCodeChanged: boolean
    referredBy: string | null
    createdAt: string
    claws: AdminUserDetailClaw[]
    sshKeys: AdminUserDetailSSHKey[]
    volumes: AdminUserDetailVolume[]
    billingOrders: BillingOrder[]
}

export interface AdminUserRowProps {
    user: AdminUserListItem
    onSelect: (userId: string) => void
}

export interface AdminUserDetailModalProps {
    userId: string | null
    onClose: () => void
}

export interface AdminUsersTabProps {
    totalUsers: number
}

export interface AdminAnalyticsDataPoint {
    date: string
    count: number
}

export interface AdminAnalyticsResponse {
    users: AdminAnalyticsDataPoint[]
    claws: AdminAnalyticsDataPoint[]
    pendingClaws: AdminAnalyticsDataPoint[]
    sshKeys: AdminAnalyticsDataPoint[]
    volumes: AdminAnalyticsDataPoint[]
    referrals: AdminAnalyticsDataPoint[]
    waitlist: AdminAnalyticsDataPoint[]
    exports: AdminAnalyticsDataPoint[]
    emails: AdminAnalyticsDataPoint[]
}

export interface AdminAnalyticsChartProps {
    title: string
    data: AdminAnalyticsDataPoint[]
    color: string
    range: AdminAnalyticsRange
}

export interface AdminStats {
    users: number
    claws: number
    pendingClaws: number
    sshKeys: number
    volumes: number
    referrals: number
    waitlist: number
    exports: number
    emails: number
    billing: number
}

export interface AdminReferralListItem {
    id: string
    referrerId: string
    referredUserId: string
    paymentCount: number
    totalEarned: number
    createdAt: string
    referrerEmail: string | null
    referredEmail: string | null
}

export interface AdminPendingClawListItem {
    id: string
    name: string
    provider: string
    planId: string
    location: string
    priceMonthly: number
    billingInterval: string | null
    createdAt: string
    expiresAt: string
    userId: string
    ownerEmail: string | null
}

export interface AdminWaitlistListItem {
    id: string
    email: string
    userId: string | null
    createdAt: string
}

export interface AdminExportListItem {
    id: string
    fileSize: number | null
    createdAt: string
    userId: string
    clawId: string
    ownerEmail: string | null
    clawName: string | null
}

export interface AdminEmailListItem {
    id: string
    feature: string
    sentAt: string
    userId: string
    ownerEmail: string | null
}

export interface AdminBillingApiResponse {
    items: BillingOrder[]
    totalCount: number
    maxPage: number
}

export interface AdminBillingResponse {
    items: BillingOrder[]
    total: number
    maxPage: number
}

export interface AdminBillingDetailViewProps {
    order: BillingOrder
    onClose: () => void
}

export interface AdminPaginatedResponse<T> {
    items: T[]
    total: number
    page: number
    totalPages: number
}

export interface AdminClawListItem {
    id: string
    name: string
    provider: string
    status: string
    ip: string | null
    planId: string
    location: string | null
    subdomain: string | null
    subscriptionStatus: string | null
    billingInterval: string | null
    deletionScheduledAt: string | null
    createdAt: string
    userId: string
    ownerEmail: string | null
}

export interface AdminClawsResponse {
    items: AdminClawListItem[]
    total: number
    page: number
    totalPages: number
}

export interface AdminSSHKeyListItem {
    id: string
    name: string
    fingerprint: string
    createdAt: string
    userId: string
    ownerEmail: string | null
}

export interface AdminSSHKeysResponse {
    items: AdminSSHKeyListItem[]
    total: number
    page: number
    totalPages: number
}

export interface AdminVolumeListItem {
    id: string
    name: string
    size: number
    location: string
    status: string
    createdAt: string
    userId: string
    ownerEmail: string | null
}

export interface AdminVolumesResponse {
    items: AdminVolumeListItem[]
    total: number
    page: number
    totalPages: number
}

export interface UpdateAdminUserData {
    name?: string | null
    referralCode?: string | null
}

export interface UpdateAdminUserMutationParams {
    id: string
    data: UpdateAdminUserData
}

export interface RangeBucketConfig {
    count: number
    stepMs: number
    offsetMs: number
}

export interface AdminEntitySelection {
    type:
        | 'user'
        | 'claw'
        | 'ssh-key'
        | 'volume'
        | 'pending-claw'
        | 'referral'
        | 'waitlist'
        | 'export'
        | 'email'
        | 'billing'
    id: string
    data: unknown
}

export interface AdminResourceTabProps {
    onSelectEntity: (entity: AdminEntitySelection) => void
}

export interface AdminDetailModalProps {
    entity: AdminEntitySelection | null
    onClose: () => void
    onNavigateToUser: (userId: string) => void
}

export interface AdminDetailFieldProps {
    label: string
    value: ReactNode
    className?: string
}

export interface AdminOwnerLinkProps {
    userId: string
    email: string | null
    onNavigateToUser: (userId: string) => void
}

export interface AdminStatusBadgeProps {
    status: string
}

export interface AdminClawDetailViewProps {
    claw: AdminClawListItem
    onClose: () => void
    onNavigateToUser: (userId: string) => void
}

export interface AdminSSHKeyDetailViewProps {
    sshKey: AdminSSHKeyListItem
    onClose: () => void
    onNavigateToUser: (userId: string) => void
}

export interface AdminVolumeDetailViewProps {
    volume: AdminVolumeListItem
    onClose: () => void
    onNavigateToUser: (userId: string) => void
}

export interface AdminPendingClawDetailViewProps {
    pendingClaw: AdminPendingClawListItem
    onClose: () => void
    onNavigateToUser: (userId: string) => void
}

export interface AdminReferralDetailViewProps {
    referral: AdminReferralListItem
    onClose: () => void
    onNavigateToUser: (userId: string) => void
}

export interface AdminExportDetailViewProps {
    exportItem: AdminExportListItem
    onClose: () => void
    onNavigateToUser: (userId: string) => void
}

export interface AdminEmailDetailViewProps {
    email: AdminEmailListItem
    onClose: () => void
    onNavigateToUser: (userId: string) => void
}

export interface AdminUserDetailViewProps {
    userId: string
    onClose: () => void
}

export interface AdminUserFiltersProps {
    search: string
    onSearchChange: (value: string) => void
    hasClaws: string
    onHasClawsChange: (value: string) => void
    sortOrder: string
    onSortOrderChange: (value: string) => void
}

export interface AffiliatePeriodSelectorProps {
    period: AffiliatePeriod
    onPeriodChange: (period: AffiliatePeriod) => void
}

export interface AffiliateStatsGridProps {
    referralCode: string | null
    referralCodeChanged: boolean
    isLoading: boolean
    referralCount: number
    totalEarnings: number
    formatCurrency: (cents: number) => string
    onSave: (code: string) => void
    onCopy: () => void
    isPending: boolean
}

export interface AffiliatePaymentHistoryProps {
    payments: AffiliatePaymentEntry[]
    isLoading: boolean
    formatCurrency: (cents: number) => string
}

export interface AffiliateConfirmDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onConfirm: () => void
    isPending: boolean
}

export interface ConfirmationDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description: ReactNode
    confirmLabel: string
    onConfirm: () => void
    isPending: boolean
    variant?: 'default' | 'destructive'
}

export interface ChangelogFeature {
    key: TranslationKey
    type: ChangelogFeatureType
}

export interface ChangelogRelease {
    dateKey: TranslationKey
    titleKey: TranslationKey
    descriptionKey: TranslationKey
    features: ChangelogFeature[]
    upcoming?: boolean
}

export interface DashboardHeaderProps {
    dashboardTab: DashboardTab
    isLocal: boolean
    isLoading: boolean
    displayedClaws: Claw[]
    displayName: string
    dnsSetup: boolean | null
    dnsLoading: boolean
    openLinksWindowed: boolean
    appVersion: string | null
    dropdownFooterLinks: FooterLink[]
    onTabChange: (tab: DashboardTab) => void
    onCreateClick: () => void
    onDnsSetup: () => void
    onSignOut: () => Promise<void>
}

export interface DashboardChatViewProps {
    displayedClaws: Claw[]
    agentQueries: UseQueryResult<ClawAgentsResponse>[]
    plans: Plan[]
    sshKeys: SSHKey[]
    adminMode: boolean
    chatSelectedAgent: ChatSelectedAgent | null
    chatSettingsClawId: string | null
    chatAgentTab: PlaygroundAgentDetailTab | null
    chatClawTab: PlaygroundDetailTab | null
    onAgentSelect: (value: ChatSelectedAgent | null) => void
    onConfigureAgent: (agentId: string, clawId: string) => void
    onCreateAgent: (clawId: string, clawName: string) => void
    onSettingsClawChange: (value: string | null) => void
    onAgentTabChange: (value: PlaygroundAgentDetailTab | null) => void
    onClawTabChange: (value: PlaygroundDetailTab | null) => void
    onCreateClick: () => void
}

export interface DashboardPlaygroundViewProps {
    displayedClaws: Claw[]
    agentQueries: UseQueryResult<ClawAgentsResponse>[]
    adminMode: boolean
    nodes: Node[]
    edges: Edge[]
    plans: Plan[]
    sshKeys: SSHKey[]
    selectedClawId: string | null
    selectedAgentId: string | null
    selectedAgentClawId: string | null
    playgroundClawTab: PlaygroundDetailTab | null
    playgroundAgentTab: PlaygroundAgentDetailTab | null
    isLoading: boolean
    activeIsError: boolean
    onClawSelect: (clawId: string | null) => void
    onAgentSelect: (agentId: string | null, clawId: string | null) => void
    onPlaygroundClawTabChange: (tab: PlaygroundDetailTab | null) => void
    onPlaygroundAgentTabChange: (tab: PlaygroundAgentDetailTab | null) => void
    onCreateClick: () => void
}

export interface UseURLStateRestorationParams {
    searchParams: URLSearchParams
    setSearchParams: (
        params: Record<string, string>,
        options?: { replace?: boolean }
    ) => void
    dashboardTab: DashboardTab
    setDashboardTab: (tab: DashboardTab) => void
    selectedClawId: string | null
    setSelectedClawId: (value: string | null) => void
    selectedAgentId: string | null
    setSelectedAgentId: (value: string | null) => void
    selectedAgentClawId: string | null
    setSelectedAgentClawId: (value: string | null) => void
    chatSelectedAgent: ChatSelectedAgent | null
    setChatSelectedAgent: (value: ChatSelectedAgent | null) => void
    chatSettingsClawId: string | null
    setChatSettingsClawId: (value: string | null) => void
    chatAgentTab: PlaygroundAgentDetailTab | null
    setChatAgentTab: (value: PlaygroundAgentDetailTab | null) => void
    playgroundAgentTab: PlaygroundAgentDetailTab | null
    setPlaygroundAgentTab: (value: PlaygroundAgentDetailTab | null) => void
    playgroundClawTab: PlaygroundDetailTab | null
    setPlaygroundClawTab: (value: PlaygroundDetailTab | null) => void
    chatClawTab: PlaygroundDetailTab | null
    setChatClawTab: (value: PlaygroundDetailTab | null) => void
    setShowCreate: (value: boolean) => void
    setPreselectedPlanId: (value: string | null) => void
    showToast: (message: string, type: ToastType) => void
    awaitingClaw: boolean
}

export interface UseInfiniteScrollObserverParams {
    isFetchingNextPage: boolean
    hasNextPage: boolean
    fetchNextPage: () => void
}

export interface InfinitePageData<T> {
    items: T[]
    total: number
}

export interface UsePaginationStateParams<T> {
    data: { pages: InfinitePageData<T>[] } | undefined
    pageSize: number
}

export interface ConnectedAccountRowProps {
    icon: ReactNode
    label: string
    isConnected: boolean
    isDisabled?: boolean
    isPending: boolean
    isLoading?: boolean
    onConnect?: () => void
    onDisconnect?: () => void
}

export interface UsePaginationStateReturn<T> {
    allItems: T[]
    total: number
    remaining: number
    skeletonCount: number
}

export interface BillingOrderCardProps {
    order: BillingOrder
    loadingInvoiceIds: Set<string>
    onViewInvoice: (orderId: string) => void
    formatDate: (dateString: string | undefined) => string
    formatCurrency: (amount: number, currency: string) => string
    getStatusBadge: (status: string) => ReactNode
    getBillingReasonLabel: (reason: string) => string
}

export interface CompareTableMobileProps {
    categories: CompareCategory[]
    clawhost: CompareCompetitor
    selectedCompetitorId: string
    selectedCompetitorNameKey: string
    renderValue: (value: CompareFeatureValue) => ReactNode
}

export interface CompareTableDesktopProps {
    categories: CompareCategory[]
    competitors: CompareCompetitor[]
    colSpan: number
    renderValue: (value: CompareFeatureValue) => ReactNode
}