import {
    ADMIN_USERS_QUERY_KEY,
    useAdminAnalytics,
    useAdminBillingList,
    useAdminClawsList,
    useAdminEmailsList,

    useAdminPendingClawsList,
    useAdminReferralsList,
    useAdminSSHKeysList,
    useAdminStats,
    useAdminUsers,
    useAdminUserDetail,
    useAdminVolumesList,
    useAdminWaitlistList,
    useUpdateAdminUser
} from '@/hooks/useAdmin'

import {
    useAffiliate,
    useGenerateReferralCode,
    useUpdateReferralCode,
    AFFILIATE_QUERY_KEY
} from '@/hooks/useAffiliate'

import {
    useClaws,
    useAdminClaws,
    usePurchaseClaw,
    useStartClaw,
    useStopClaw,
    useRestartClaw,
    useDeleteClaw,
    useCancelDeletion,
    useHardDeleteClaw,
    useClawDiagnostics,
    useClawLogs,
    useRepairClaw,
    useClawFiles,
    useClawFile,
    useUpdateClawFile,
    useReinstallClaw,
    useClawVersion,
    useRenameClaw,
    useUpdateClawSubdomain,
    useCancelPendingClaw,
    CLAWS_QUERY_KEY,
    CLAW_FILES_QUERY_KEY,
    CLAW_FILE_QUERY_KEY,
    CLAW_VERSION_QUERY_KEY,
    CLAW_VERSIONS_QUERY_KEY
} from '@/hooks/useClaws'

import {
    useSSHKeys,
    useCreateSSHKey,
    useDeleteSSHKey,
    SSH_KEYS_QUERY_KEY
} from '@/hooks/useSSHKeys'

import {
    useProfile,
    useUpdateProfile,
    useUserStats,
    useBillingHistory,
    PROFILE_QUERY_KEY,
    USER_STATS_QUERY_KEY,
    BILLING_HISTORY_QUERY_KEY
} from '@/hooks/useUser'

import {
    usePlans,
    useLocations,
    useVolumePricing,
    usePlanAvailability,
    PLANS_QUERY_KEY,
    LOCATIONS_QUERY_KEY,
    VOLUME_PRICING_QUERY_KEY,
    PLAN_AVAILABILITY_QUERY_KEY
} from '@/hooks/usePlans'

import {
    useGitHubStars,
    GITHUB_REPO_URL,
    GITHUB_STARS_QUERY_KEY
} from '@/hooks/useGitHubStars'

import useClawCardActions from '@/hooks/useClawCardActions'
import useScrollToBottom from '@/hooks/useScrollToBottom'
import useDebouncedValue from '@/hooks/useDebouncedValue'
import useNetworkStatus from '@/hooks/useNetworkStatus'
import useThemeEffect from '@/hooks/useThemeEffect'
import useLanguageEffect from '@/hooks/useLanguageEffect'
import useAppVersion from '@/hooks/useAppVersion'
import useLocalFooterLinks from '@/hooks/useLocalFooterLinks'
import useRefer from '@/hooks/useRefer'
import useRoutePrefetch from '@/hooks/useRoutePrefetch'
import useInfiniteScrollObserver from '@/hooks/useInfiniteScrollObserver'
import usePaginationState from '@/hooks/usePaginationState'
import useURLStateRestoration from '@/hooks/useURLStateRestoration'
import useClawSettingsForm from '@/hooks/useClawSettingsForm'
import useLinkedProvider from '@/hooks/useLinkedProvider'
import createApiMutation from '@/hooks/createApiMutation'
import useToast from '@/hooks/useToast'
import useCopyWithFeedback from '@/hooks/useCopyWithFeedback'
import useCreateClawForm from '@/hooks/useCreateClawForm'

export {
    ADMIN_USERS_QUERY_KEY,
    useAdminAnalytics,
    useAdminBillingList,
    useAdminClawsList,
    useAdminEmailsList,

    useAdminPendingClawsList,
    useAdminReferralsList,
    useAdminSSHKeysList,
    useAdminStats,
    useAdminUsers,
    useAdminUserDetail,
    useAdminVolumesList,
    useAdminWaitlistList,
    useUpdateAdminUser,
    useAffiliate,
    useGenerateReferralCode,
    useUpdateReferralCode,
    AFFILIATE_QUERY_KEY,
    useClaws,
    useAdminClaws,
    usePurchaseClaw,
    useStartClaw,
    useStopClaw,
    useRestartClaw,
    useDeleteClaw,
    useCancelDeletion,
    useHardDeleteClaw,
    useClawDiagnostics,
    useClawLogs,
    useRepairClaw,
    useClawFiles,
    useClawFile,
    useUpdateClawFile,
    useReinstallClaw,
    useClawVersion,
    useRenameClaw,
    useUpdateClawSubdomain,
    useCancelPendingClaw,
    CLAWS_QUERY_KEY,
    CLAW_FILES_QUERY_KEY,
    CLAW_FILE_QUERY_KEY,
    CLAW_VERSION_QUERY_KEY,
    CLAW_VERSIONS_QUERY_KEY,
    useSSHKeys,
    useCreateSSHKey,
    useDeleteSSHKey,
    SSH_KEYS_QUERY_KEY,
    useProfile,
    useUpdateProfile,
    useUserStats,
    useBillingHistory,
    PROFILE_QUERY_KEY,
    USER_STATS_QUERY_KEY,
    BILLING_HISTORY_QUERY_KEY,
    usePlans,
    useLocations,
    useVolumePricing,
    usePlanAvailability,
    PLANS_QUERY_KEY,
    LOCATIONS_QUERY_KEY,
    VOLUME_PRICING_QUERY_KEY,
    PLAN_AVAILABILITY_QUERY_KEY,
    useGitHubStars,
    GITHUB_REPO_URL,
    GITHUB_STARS_QUERY_KEY,
    useClawCardActions,
    useDebouncedValue,
    useNetworkStatus,
    useScrollToBottom,
    useThemeEffect,
    useLanguageEffect,
    useAppVersion,
    useLocalFooterLinks,
    useRefer,
    useRoutePrefetch,
    useInfiniteScrollObserver,
    usePaginationState,
    useURLStateRestoration,
    useClawSettingsForm,
    useLinkedProvider,
    createApiMutation,
    useToast,
    useCopyWithFeedback,
    useCreateClawForm
}