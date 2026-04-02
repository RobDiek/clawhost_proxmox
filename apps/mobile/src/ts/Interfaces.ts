import type { ReactNode } from 'react'
import type { ClawStatus, ToastType, UserRole } from '@/ts/Types'

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
    createdAt: string
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
    createdAt: string
}

export interface ToastData {
    message: string
    type: ToastType
    duration?: number
}

export interface StatusConfig {
    color: string
    bgColor: string
    label: string
    pulse?: boolean
}

export interface ScreenHeaderProps {
    title: string
    action?: ReactNode
}

export interface ClawCardProps {
    claw: Claw
    plan: Plan | undefined
}

export interface CopyableFieldProps {
    label: string
    value: string
    icon?: ReactNode
    width?: number
}

export interface StatusBadgeProps {
    status: ClawStatus
    config: StatusConfig
}

export interface ClawMascotProps {
    size?: number
    color?: string
}

export interface ProviderIconProps {
    provider: string
    size?: number
}

export interface AuthProviderProps {
    children: ReactNode
}

export interface AuthContextValue {
    user: FirebaseUser | null
    loading: boolean
    sendOtp: (email: string) => Promise<void>
    verifyOtp: (email: string, code: string) => Promise<void>
    signOut: () => Promise<void>
}

export interface VerifyOtpResponse {
    customToken: string
}

export interface FirebaseUser {
    uid: string
    email: string | null
    displayName: string | null
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

export interface CustomerPortalResponse {
    url: string
}

export interface UpdateProfileData {
    name?: string
}

export interface BillingOrderItemProps {
    order: BillingOrder
    onViewInvoice: (orderId: string) => void
    isInvoiceLoading: boolean
}

export interface VolumePricing {
    pricePerGbMonthly: number
    minSize: number
    maxSize: number
}

export interface PlanAvailability {
    [planId: string]: string[]
}

export interface PurchaseClawData {
    name: string
    provider: string
    planId: string
    location: string
    password?: string
    sshKeyId?: string
    volumeSize?: number
    priceMonthly: number
}

export interface PurchaseClawResponse {
    checkoutUrl: string
    checkoutId: string
    pendingClawId: string
    expiresAt: string
}

export interface CreateClawModalProps {
    visible: boolean
    onClose: () => void
}

export interface VoiceOrbProps {
    intensity: number
    size?: number
}

export interface VoiceChatModalProps {
    visible: boolean
    clawName: string
    onClose: () => void
}