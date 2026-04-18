import type {
    ElementType,
    FormEvent,
    MutableRefObject,
    ReactNode,
    RefObject
} from 'react'
import type { MotionValue } from 'framer-motion'
import type { User } from 'firebase/auth'
import type { QueryClient } from '@tanstack/react-query'
import type { TranslationKey } from '@openclaw/i18n'
import type {
    AdminAnalyticsRange,
    AffiliatePeriod,
    AuthMethod,
    BillingInterval,
    ClawAvatarSize,
    ClawStatus,
    Language,
    LoginLoadingMethod,
    OAuthProvider,
    ClawDetailTab,
    ThemeMode,
    ClawFileType,
    CompareFeatureStatus,
    TerminalStatus,
    ToastType,
    UserRole,
    Product,
    ChangelogFeatureType,
    CopiedFieldType
} from '@/ts/Types'

export interface Volume {
    id: string
    name: string
    size: number
    status: string
}

export interface Claw {
    id: string
    name: string
    emoji: string | null
    emojiColor: string | null
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
    hostKeyFingerprint: string | null
    subscriptionStatus: string | null
    polarSubscriptionId: string | null
    billingInterval: string | null
    currentPeriodStart: string | null
    currentPeriodEnd: string | null
    volumes?: Volume[]
    ownerEmail?: string | null
    deletionScheduledAt: string | null
    lastSubdomainChangedAt: string | null
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

export interface UserStats {
    clawCount: number
    sshKeyCount: number
    orderCount: number
}

export interface AccountProfileSectionProps {
    name: string
    profileName: string | null
    email: string
    isLocal: boolean
    joinedDate: string | undefined
    clawCount: number
    sshKeyCount: number
    hasChanges: boolean
    isPending: boolean
    onNameChange: (value: string) => void
    onSave: () => void
}

export interface AccountSettingsSectionProps {
    openLinksWindowed: boolean
    setOpenLinksWindowed: (value: boolean) => void
}

export interface AccountBillingSectionProps {
    isPortalLoading: boolean
    onManageBilling: () => void
}

export interface ConnectedAccountsSectionProps {
    authMethods: AuthMethod[] | undefined
    linkingProvider: AuthMethod | null
    unlinkingProvider: AuthMethod | null
    providerBusy: boolean
    onLink: (provider: OAuthProvider) => void
    onUnlink: (provider: OAuthProvider) => void
}

export interface UseLinkedProviderReturn {
    linkingProvider: AuthMethod | null
    unlinkingProvider: AuthMethod | null
    providerBusy: boolean
    handleLinkProvider: (provider: OAuthProvider) => Promise<void>
    handleUnlinkProvider: (provider: OAuthProvider) => Promise<void>
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

export interface UseToastReturn {
    success: (text: string) => void
    error: (text: string) => void
    warning: (text: string) => void
    info: (text: string) => void
}

export interface UseCopyWithFeedbackReturn {
    copied: boolean
    copy: (value: string) => void
}

export interface UseCreateClawFormValues {
    name: string
    planId: string
    location: string
    password: string
    showPassword: boolean
    gatewayToken: string
    showGatewayToken: boolean
    selectedSshKeyId: string
    volumeSize: number
    billingCycle: BillingInterval
    showAdvanced: boolean
    agreedToTerms: boolean
}

export interface UseCreateClawFormErrors {
    name: string
}

export interface UseCreateClawFormReturn {
    values: UseCreateClawFormValues
    errors: UseCreateClawFormErrors
    setField: <K extends keyof UseCreateClawFormValues>(
        key: K,
        value: UseCreateClawFormValues[K]
    ) => void
    reset: () => void
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
    theme: ThemeMode
    setTheme: (theme: ThemeMode) => void
    language: Language
    setLanguage: (language: Language) => void
    openLinksWindowed: boolean
    setOpenLinksWindowed: (value: boolean) => void
    product: Product
    setProduct: (product: Product) => void
    affiliatePeriod: AffiliatePeriod
    setAffiliatePeriod: (period: AffiliatePeriod) => void
    sidebarCollapsed: boolean
    setSidebarCollapsed: (collapsed: boolean) => void
}

export interface VersionsState {
    installingVersion: string | null
    setInstallingVersion: (value: string | null) => void
    confirmVersion: string | null
    setConfirmVersion: (value: string | null) => void
    resetVersionsState: () => void
}

export interface UseTerminalConnectionReturn {
    containerRef: React.RefObject<HTMLDivElement>
    status: TerminalStatus
    showScrollButton: boolean
    showOverlay: boolean
    connect: () => Promise<void>
    handleTerminalScrollToBottom: () => void
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
    chatSettingsClawId: string | null
    setChatSettingsClawId: (value: string | null) => void
    chatClawTab: ClawDetailTab | null
    setChatClawTab: (value: ClawDetailTab | null) => void
    showCreate: boolean
    setShowCreate: (value: boolean) => void
    preselectedPlanId: string | null
    setPreselectedPlanId: (value: string | null) => void
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
    email: string
    code: string
}

export interface PendingConflict {
    accessToken: string
    providerId: string
    email: string
}

export interface AuthContextType {
    user: User | null
    loading: boolean
    cachedProfile: CachedProfile | null
    pendingConflict: PendingConflict | null
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
    clearPendingConflict: () => void
    isLocal?: boolean
}

export interface FooterLink {
    label: string
    href: string
    external?: boolean
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
    emoji?: string | null
    emojiColor?: string | null
    size?: ClawAvatarSize
    className?: string
}

export interface SupportButtonProps {
    showLabel?: boolean
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
    description?: string
    action?: ReactNode
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

export interface LegalPageLayoutProps {
    titleKey: TranslationKey
    descriptionKey: TranslationKey
    lastUpdatedKey: TranslationKey
    image?: string
    url: string
    children: ReactNode
}

export interface LegalSectionProps {
    titleKey: TranslationKey
    textKey?: TranslationKey
    items?: TranslationKey[]
    children?: ReactNode
}

export interface LegalContactSectionProps {
    titleKey: TranslationKey
    textKey: TranslationKey
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

export interface ClawCardActions {
    onStart: () => void
    onShowStartModal: () => void
    onShowStopModal: () => void
    onShowRestartModal: () => void
    onShowDeleteModal: () => void
    onCancelDeletion: () => void
    onShowHardDeleteModal: () => void
    onShowDiagnostics: () => void
    onShowLogs: () => void
    onShowReinstallModal: () => void
    onShowCredentials: () => void
    onExport: () => void
    onResumeCheckout: () => void
    onCancelPending: () => void
    onUpdatePayment: () => void
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

export interface ClawCardDialogsProps {
    clawName: string
    showStartModal: boolean
    setShowStartModal: (open: boolean) => void
    showDeleteModal: boolean
    setShowDeleteModal: (open: boolean) => void
    showStopModal: boolean
    setShowStopModal: (open: boolean) => void
    showRestartModal: boolean
    setShowRestartModal: (open: boolean) => void
    showHardDeleteModal: boolean
    setShowHardDeleteModal: (open: boolean) => void
    onStart: () => void
    onDelete: () => void
    onStop: () => void
    onRestart: () => void
    onHardDelete: () => void
    isStartPending: boolean
    isDeletePending: boolean
    isStopPending: boolean
    isRestartPending: boolean
    isHardDeletePending: boolean
    showReinstallModal: boolean
    setShowReinstallModal: (open: boolean) => void
    onReinstall: () => void
    isReinstallPending: boolean
    showCancelDeletionModal: boolean
    setShowCancelDeletionModal: (show: boolean) => void
    onCancelDeletion: () => void
    isCancelDeletionPending: boolean
}

export interface UseClawCardActionsParams {
    claw: Claw | null
}

export interface UseClawCardActionsReturn {
    actions: ClawCardActions | null
    isMutating: boolean
    dialogsProps: ClawCardDialogsBundleProps | null
}

export interface ClawCardDialogsBundleProps {
    clawId: string
    clawName: string
    clawIp: string
    showStartModal: boolean
    setShowStartModal: (open: boolean) => void
    showDeleteModal: boolean
    setShowDeleteModal: (open: boolean) => void
    showStopModal: boolean
    setShowStopModal: (open: boolean) => void
    showRestartModal: boolean
    setShowRestartModal: (open: boolean) => void
    showHardDeleteModal: boolean
    setShowHardDeleteModal: (open: boolean) => void
    showReinstallModal: boolean
    setShowReinstallModal: (open: boolean) => void
    showDiagnostics: boolean
    setShowDiagnostics: (open: boolean) => void
    showLogs: boolean
    setShowLogs: (open: boolean) => void
    showCredentials: boolean
    setShowCredentials: (open: boolean) => void
    credentialsPassword: string | null
    onStart: () => void
    onDelete: () => void
    onStop: () => void
    onRestart: () => void
    onHardDelete: () => void
    onReinstall: () => void
    isStartPending: boolean
    isDeletePending: boolean
    isStopPending: boolean
    isRestartPending: boolean
    isHardDeletePending: boolean
    isReinstallPending: boolean
    showCancelDeletionModal: boolean
    setShowCancelDeletionModal: (show: boolean) => void
    onCancelDeletion: () => void
    isCancelDeletionPending: boolean
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

export interface PurchaseClawData {
    name: string
    planId: string
    location: string
    password?: string
    gatewayToken?: string
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

export interface CheckSubdomainResponse {
    available: boolean
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

export interface UseCustomerPortalReturn {
    openPortal: (clawId?: string) => Promise<void>
    isLoading: boolean
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

export interface ClawVersionsContentProps {
    clawId: string
    readOnly?: boolean
}

export interface ClawCredentialsResponse {
    rootPassword: string | null
    gatewayToken: string | null
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

export interface ClawMetricsCpu {
    usagePercent: number
    cores: number
}

export interface ClawMetricsMemory {
    total: number
    used: number
    available: number
}

export interface ClawMetricsDisk {
    total: number
    used: number
    available: number
    usagePercent: number
}

export interface ClawMetricsLoadAvg {
    load1: number
    load5: number
    load15: number
}

export interface ClawMetricsNetwork {
    rxBytes: number
    txBytes: number
    interface: string
}

export interface ClawMetricsProcess {
    pid: number
    user: string
    cpu: number
    mem: number
    command: string
}

export interface ClawMetricsResponse {
    cpu: ClawMetricsCpu
    memory: ClawMetricsMemory
    disk: ClawMetricsDisk
    loadAvg: ClawMetricsLoadAvg
    network: ClawMetricsNetwork
    processes: ClawMetricsProcess[]
    uptime: string
    timestamp: number
}

export interface ClawOverviewSession {
    key: string
    name: string
    model: string
    started: string
    updated: string
    messageCount: number
}

export interface ClawOverviewGateway {
    active: boolean
    reachable: boolean
    portListening: boolean
    ready: boolean
}

export interface ClawOverviewInstance {
    version: string | null
    model: string | null
    contextWindow: string | null
    activeSessions: number
    memory: string | null
    agents: string | null
    heartbeat: string | null
    events: string | null
    probes: string | null
}

export interface ClawOverviewConfig {
    browserEnabled: boolean
    commandsEnabled: boolean
    tools: string[]
}

export interface ClawOverviewResponse {
    gateway: ClawOverviewGateway
    instance: ClawOverviewInstance
    config: ClawOverviewConfig | null
    sessions: ClawOverviewSession[] | null
    apiStatus: Record<string, unknown> | null
    timestamp: number
}

export interface ClawOverviewContentProps {
    clawId: string
    readOnly?: boolean
}

export interface OverviewGatewayCardProps {
    gateway: ClawOverviewGateway
    clawId: string
}

export interface OverviewInstanceCardProps {
    instance: ClawOverviewInstance
}

export interface OverviewSessionsTableProps {
    sessions: ClawOverviewSession[] | null
}

export interface OverviewConfigCardProps {
    config: ClawOverviewConfig | null
}

export interface ClawMonitorContentProps {
    clawId: string
    readOnly?: boolean
}

export interface ClawVolumesContentProps {
    volumes: Volume[]
    readOnly?: boolean
}

export interface ClawSecurityContentProps {
    claw: Claw
    sshKeys: SSHKey[]
    readOnly?: boolean
}

export interface SecretFieldProps {
    value: string
    onChange: (value: string) => void
    onRandomize: () => void
    onSave: () => void
    placeholder: string
    saveTooltip: string
    hasChanges: boolean
    saving: boolean
    readOnly?: boolean
}

export interface SecuritySSHKeySectionProps {
    clawId: string
    sshKeyId: string | null
    sshKeys: SSHKey[]
    readOnly?: boolean
}

export interface SecuritySectionProps {
    title: string
    icon: ReactNode
    children: ReactNode
}

export interface MetricCardProps {
    title: string
    icon: ReactNode
    children: ReactNode
}

export interface UsageBarProps {
    value: number
    color: string
    label: string
    detail: string
}

export interface MetricsHistoryPoint {
    time: string
    value: number
}

export interface MonitorChartProps {
    data: MetricsHistoryPoint[]
    color: string
    label: string
}

export interface MonitorProcessTableProps {
    processes: ClawMetricsProcess[]
}

export interface MonitorLoadAvgChartProps {
    load1: number
    load5: number
    load15: number
}

export interface MonitorNetworkCardProps {
    rxBytes: number
    txBytes: number
}

export interface ClawServerContentProps {
    claw: Claw
    plans: Plan[]
    readOnly?: boolean
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

export interface ClawFileExplorerContentProps {
    clawId: string
    readOnly?: boolean
}

export interface FileTreeProps {
    folders: [string, ClawFileEntry[]][]
    rootFiles: ClawFileEntry[]
    selectedPath: string
    onSelectFile: (path: string) => void
}

export interface FileTreeItemProps {
    file: ClawFileEntry
    isLast: boolean
    selectedPath: string
    onSelectFile: (path: string) => void
}

export interface FileEditorProps {
    selectedFile: ClawFileEntry | undefined
    fileType: ClawFileType
    isEditable: boolean
    isJson: boolean
    displayContent: string
    hasUnsavedChanges: boolean
    jsonError: boolean
    resolvedTheme: string
    isSaving: boolean
    onChange: (value: string) => void
    onJsonChange: (value: string) => void
    onClose: () => void
    onSave: () => void
}

export interface UseFileEditorParams {
    clawId: string
    files: ClawFileEntry[] | undefined
    readOnly?: boolean
}

export interface UseFileEditorReturn {
    selectedPath: string
    editedContent: string
    jsonError: boolean
    selectedFile: ClawFileEntry | undefined
    fileType: ClawFileType
    isEditable: boolean
    isJson: boolean
    displayContent: string
    hasUnsavedChanges: boolean
    fileContentIsPending: boolean
    fileContentIsError: boolean
    fileContentError: Error | null
    fileContentData: ReadClawFileResponse | undefined
    isSaving: boolean
    handleSelectFile: (path: string) => void
    handleChange: (value: string) => void
    handleJsonChange: (value: string) => void
    handleSave: () => void
    reset: () => void
}

export interface UseProfileOptions {
    enabled?: boolean
    staleTime?: number
    refetchInterval?: number | false
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

export interface ClawDetailPanelProps {
    claw: Claw
    plans: Plan[]
    sshKeys: SSHKey[]
    onClose: () => void
    readOnly?: boolean
    initialTab?: ClawDetailTab
    onTabChange?: (tab: ClawDetailTab) => void
    fullScreen?: boolean
}

export interface UpdateAvailableBannerProps {
    latestVersion: string
    onGoToVersions: () => void
}

export interface ClawBillingContentProps {
    claw: Claw
    plans: Plan[]
    readOnly?: boolean
}

export interface ClawBillingSubscriptionProps {
    claw: Claw
    plan: Plan | undefined
    readOnly?: boolean
}

export interface ClawBillingHistoryProps {
    polarSubscriptionId: string | null
    readOnly?: boolean
}

export interface ClawDetailSettingsTabProps {
    claw: Claw
    currentEmoji: string | null
    currentEmojiColor: string | null
    settingsName: string
    settingsNameError: string
    settingsSubdomain: string
    settingsSubdomainError: string
    settingsHasChanges: boolean
    renamePending: boolean
    subdomainPending: boolean
    emojiPending: boolean
    onNameChange: (value: string) => void
    onSubdomainChange: (value: string) => void
    onEmojiChange: (emoji: string | null, emojiColor: string | null) => void
    onSave: () => void
    readOnly?: boolean
}

export interface SectionHeaderProps {
    title: string
    action?: ReactNode
}

export interface ColorSwatchProps {
    color: string | null
    selected: boolean
    onClick: () => void
}

export interface EmojiColorPickerProps {
    emoji: string | null
    emojiColor: string | null
    onEmojiChange: (emoji: string | null, color: string | null) => void
}

export interface ExportSectionProps {
    clawId: string
}

export interface ClawPreviewContentProps {
    claw: Claw
    readOnly?: boolean
}

export interface HeaderActionButtonProps {
    icon: ElementType
    label: string
    onClick: () => void
    disabled: boolean
}

export interface ClawDetailHeaderProps {
    claw: Claw
    onClose: () => void
    fullScreen?: boolean
    versionDisplay?: string | null
    readOnly?: boolean
}

export interface ClawDetailTabBarProps {
    activeTab: ClawDetailTab
    fullScreen?: boolean
    isTabDisabled: (tabId: ClawDetailTab) => boolean
    getDisabledTooltip: (tabId: ClawDetailTab) => string
    setActiveTab: (tab: ClawDetailTab) => void
}

export interface ClawDetailTabState {
    tabStateMap: Record<string, ClawDetailTab>
    setTab: (clawId: string, tab: ClawDetailTab) => void
}

export interface UseClawSettingsFormReturn {
    settingsEmoji: string | null
    settingsEmojiColor: string | null
    settingsName: string
    settingsNameError: string
    settingsSubdomain: string
    settingsSubdomainError: string
    settingsHasChanges: boolean
    renamePending: boolean
    subdomainPending: boolean
    emojiPending: boolean
    handleEmojiChange: (emoji: string | null, emojiColor: string | null) => void
    handleSettingsNameChange: (value: string) => void
    handleSettingsSubdomainChange: (value: string) => void
    handleSettingsSave: () => void
}

export interface LanguageOption {
    value: Language
    label: string
    flag: string
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

export interface SimplePlanData {
    planId: string
    name: string
    desc: string
    price: number
    yearlyPerMonth: number
    popular: boolean
    features: SimplePlanFeature[]
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

export interface AdminUserClawsSectionProps {
    claws: AdminUserDetailClaw[]
}

export interface AdminUserSSHKeysSectionProps {
    sshKeys: AdminUserDetailSSHKey[]
    formatDate: (dateString: string | null | undefined) => string
}

export interface AdminUserVolumesSectionProps {
    volumes: AdminUserDetailVolume[]
}

export interface AdminUserBillingSectionProps {
    billingOrders: BillingOrder[]
    formatDate: (dateString: string | null | undefined) => string
    formatCurrency: (amount: number, currency?: string) => string
}

export interface ClawDetailTabConfig<T extends string = string> {
    id: T
    label: string
    icon: ElementType
}

export interface AdminPaginatedQueryParams {
    page: number
    limit: number
    search?: string
    sort?: string
    [key: string]: string | number | boolean | undefined
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
    onTerminalData: (cb: (id: string, data: string) => void) => () => void
    onTerminalExit: (cb: (id: string) => void) => () => void
}

export interface WebVitalsMetric {
    name: string
    delta: number
    id: string
}

export interface GTagWindow {
    gtag?: (...args: unknown[]) => void
}

export interface EmojiMartData {
    emojis: Record<string, { skins: { native: string }[] }>
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

export interface UpdateClawEmojiMutationParams {
    id: string
    emoji: string | null
    emojiColor: string | null
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

export interface FirebaseErrorLike {
    code?: string
    customData?: Record<string, unknown>
}

export interface ErrorWithMessage {
    message: unknown
}

export interface ErrorResponse {
    error?: string
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
    gatewayToken: string
    onGatewayTokenChange: (token: string) => void
    showGatewayToken: boolean
    onToggleShowGatewayToken: () => void
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

export interface AdminUsersTabProps {
    onSelectEntity: (entity: AdminEntitySelection) => void
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

export interface CreateApiMutationOptions<TArgs, TResult> {
    invalidateKeys?:
        | ReadonlyArray<readonly unknown[]>
        | ((args: TArgs, result: TResult) => ReadonlyArray<readonly unknown[]>)
    onSuccess?: (result: TResult, args: TArgs, queryClient: QueryClient) => void
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
    isLocal: boolean
    isLoading: boolean
    displayedClaws: Claw[]
    displayName: string
    dnsSetup: boolean | null
    dnsLoading: boolean
    openLinksWindowed: boolean
    appVersion: string | null
    dropdownFooterLinks: FooterLink[]
    onCreateClick: () => void
    onDnsSetup: () => void
    onSignOut: () => Promise<void>
}

export interface DashboardChatViewProps {
    displayedClaws: Claw[]
    plans: Plan[]
    sshKeys: SSHKey[]
    adminMode: boolean
    chatSettingsClawId: string | null
    chatClawTab: ClawDetailTab | null
    onSettingsClawChange: (clawId: string | null) => void
    onClawTabChange: (tab: ClawDetailTab | null) => void
    onCreateClick: () => void
}

export interface ChatSidebarProps {
    claws: Claw[]
    selectedClawId: string | null
    readOnly?: boolean
    onOpenClawSettings: (clawId: string) => void
    onClose?: () => void
}

export interface ChatSidebarTreeViewProps {
    claws: Claw[]
    selectedClawId: string | null
    readOnly?: boolean
    onOpenClawSettings: (clawId: string) => void
}

export interface ChatSidebarSearchProps {
    value: string
    onChange: (value: string) => void
    clawCount: number
}

export interface ChatSidebarClawHeaderProps {
    claw: Claw
    isSelected: boolean
    statusConfig: StatusConfig
    onOpenClawSettings: (clawId: string) => void
}

export interface UseURLStateRestorationParams {
    searchParams: URLSearchParams
    setSearchParams: (
        params: Record<string, string>,
        options?: { replace?: boolean }
    ) => void
    chatSettingsClawId: string | null
    setChatSettingsClawId: (value: string | null) => void
    chatClawTab: ClawDetailTab | null
    setChatClawTab: (value: ClawDetailTab | null) => void
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

export interface ClawPendingViewProps {
    status: string
    checkoutUrl?: string | null
    onCancel?: () => void
    cancelPending?: boolean
}

export interface BillingOrderCardProps {
    order: BillingOrder
    loadingInvoiceIds: Set<string>
    onViewInvoice: (orderId: string) => void
    readOnly?: boolean
}

export interface BillingStatusConfig {
    className: string
    labelKey: TranslationKey
}

export interface BillingStatusBadgeProps {
    status: string
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

export interface UseOtpFlowParams {
    email: string
    cooldown: number
    startCooldown: () => void
    onCodeSent: () => void
}

export interface UseOtpFlowReturn {
    code: string[]
    codeError: boolean
    emailError: string
    loadingMethod: LoginLoadingMethod
    isCodeComplete: boolean
    inputRefs: MutableRefObject<(HTMLInputElement | null)[]>
    setEmailError: (value: string) => void
    handleSendOtp: () => Promise<void>
    handleVerifyOtp: (fullCode: string) => Promise<void>
    handleCodeChange: (value: string, index: number) => void
    handleCodeKeyDown: (key: string, index: number) => void
    handleResend: () => Promise<void>
    handleOAuth: (provider: OAuthProvider) => Promise<void>
    resetCode: () => void
}

export interface EmailStepProps {
    email: string
    setEmail: (value: string) => void
    emailError: string
    loadingMethod: LoginLoadingMethod
    cooldown: number
    onSubmit: (e: FormEvent) => void
    onOAuth: (provider: OAuthProvider) => void
}

export interface OtpCodeStepProps {
    email: string
    code: string[]
    codeError: boolean
    isCodeComplete: boolean
    loadingMethod: LoginLoadingMethod
    cooldown: number
    inputRefs: MutableRefObject<(HTMLInputElement | null)[]>
    onCodeChange: (value: string, index: number) => void
    onCodeKeyDown: (key: string, index: number) => void
    onVerify: () => void
    onResend: () => void
    onChangeEmail: () => void
}