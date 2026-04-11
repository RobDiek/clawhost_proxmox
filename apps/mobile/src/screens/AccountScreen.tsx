import type { FC, ReactNode } from 'react'
import type { BillingOrder } from '@/ts/Interfaces'

import { Fragment, useState, useEffect } from 'react'
import {
    ActivityIndicator,
    Alert,
    Linking,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Calendar, Key, ArrowSquareOut } from 'phosphor-react-native'
import { t } from '@openclaw/i18n'
import { inputValidation } from '@openclaw/shared'
import { useAuth } from '@/lib/auth'
import getLocale from '@/lib/getLocale'
import api from '@/lib/api'
import {
    useProfile,
    useUpdateProfile,
    useUserStats,
    useBillingHistory
} from '@/hooks'
import { COLORS, SPACING, TYPOGRAPHY } from '@/lib/theme'
import {
    ClawMascot,
    GridBackground,
    BillingOrderItem,
    BillingSkeleton
} from '@/components'

const BILLING_PAGE_SIZE = 10

const AccountScreen: FC = (): ReactNode => {
    const insets = useSafeAreaInsets()
    const { user, signOut } = useAuth()

    const { data: profile } = useProfile(user)
    const { data: userStats, isLoading: isStatsLoading } = useUserStats(user)
    const updateMutation = useUpdateProfile()
    const {
        data: billingData,
        isLoading: isBillingLoading,
        isError: isBillingError,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        refetch: refetchBilling
    } = useBillingHistory(user, BILLING_PAGE_SIZE)

    const [name, setName] = useState('')
    const [hasChanges, setHasChanges] = useState(false)
    const [loadingInvoiceIds, setLoadingInvoiceIds] = useState<Set<string>>(
        new Set()
    )
    const [isPortalLoading, setIsPortalLoading] = useState(false)

    useEffect(() => {
        if (profile?.name) {
            setName(profile.name)
        }
    }, [profile?.name])

    const handleNameChange = (value: string): void => {
        setName(value)
        setHasChanges(value !== (profile?.name || ''))
    }

    const handleSave = (): void => {
        updateMutation.mutate(
            { name },
            {
                onSuccess: (data) => {
                    setName(data.name || '')
                    setHasChanges(false)
                    Alert.alert(t('account.profileUpdatedSuccessfully'))
                },
                onError: (err: Error) => {
                    Alert.alert(
                        err.message || t('errors.failedToUpdateProfile')
                    )
                }
            }
        )
    }

    const handleViewInvoice = async (orderId: string): Promise<void> => {
        setLoadingInvoiceIds((prev) => new Set(prev).add(orderId))
        try {
            const { url } = await api.getOrderInvoice(orderId)
            await Linking.openURL(url)
        } catch {
            Alert.alert(t('account.failedToLoadInvoice'))
        } finally {
            setLoadingInvoiceIds((prev) => {
                const next = new Set(prev)
                next.delete(orderId)
                return next
            })
        }
    }

    const handleManageBilling = async (): Promise<void> => {
        setIsPortalLoading(true)
        try {
            const { url } = await api.getCustomerPortal()
            await Linking.openURL(url)
        } catch {
            Alert.alert(t('account.failedToLoadPortal'))
        } finally {
            setIsPortalLoading(false)
        }
    }

    const email = user?.email || ''
    const displayName = name || profile?.name || email

    const getInitials = (text: string): string => {
        if (!text) return '?'
        const parts = text.split(' ')
        if (parts.length > 1) {
            return (
                parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
            ).toUpperCase()
        }
        return text.charAt(0).toUpperCase()
    }

    const formatDate = (dateString: string | undefined): string => {
        if (!dateString) return '...'
        return new Date(dateString).toLocaleDateString(getLocale(), {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })
    }

    const allBillingItems =
        billingData?.pages.flatMap((page) => page.items) ?? []
    const billingTotal = userStats?.orderCount ?? 0

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <GridBackground />

            <View style={styles.header}>
                <Text style={styles.title}>{t('nav.account')}</Text>
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps='handled'
            >
                <View style={styles.section}>
                    <View style={styles.profileHeader}>
                        <View style={styles.avatar}>
                            <LinearGradient
                                colors={['#ef5350', '#c62828']}
                                style={styles.avatarGradient}
                            >
                                <Text style={styles.avatarText}>
                                    {getInitials(displayName)}
                                </Text>
                            </LinearGradient>
                        </View>
                        <View style={styles.profileInfo}>
                            <Text style={styles.profileName} numberOfLines={1}>
                                {name ||
                                    profile?.name ||
                                    t('account.noNameSet')}
                            </Text>
                            <Text style={styles.profileEmail} numberOfLines={1}>
                                {email}
                            </Text>
                            <View style={styles.joinedRow}>
                                <Calendar size={12} color={COLORS.textDim} />
                                <Text style={styles.profileJoined}>
                                    {t('account.joined')}{' '}
                                    {formatDate(profile?.createdAt)}
                                </Text>
                            </View>
                        </View>
                    </View>

                    {!isStatsLoading && userStats && (
                        <View style={styles.statsRow}>
                            <View style={styles.statItem}>
                                <ClawMascot
                                    size={14}
                                    color={COLORS.textMuted}
                                />
                                <Text style={styles.statValue}>
                                    {userStats.clawCount}
                                </Text>
                                <Text style={styles.statLabel}>
                                    {t('account.claws')}
                                </Text>
                            </View>
                            <View style={styles.statItem}>
                                <Key size={14} color={COLORS.textMuted} />
                                <Text style={styles.statValue}>
                                    {userStats.sshKeyCount}
                                </Text>
                                <Text style={styles.statLabel}>
                                    {t('account.sshKeys')}
                                </Text>
                            </View>
                        </View>
                    )}
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                        {t('account.displayName')}
                    </Text>
                    <TextInput
                        style={styles.nameInput}
                        value={name}
                        onChangeText={handleNameChange}
                        placeholder={t('account.enterYourName')}
                        placeholderTextColor={COLORS.textDim}
                        maxLength={inputValidation.USER_NAME.MAX}
                        returnKeyType='done'
                        onSubmitEditing={handleSave}
                    />
                    <Pressable
                        onPress={handleSave}
                        disabled={!hasChanges || updateMutation.isPending}
                        style={[
                            styles.saveButton,
                            (!hasChanges || updateMutation.isPending) &&
                                styles.saveButtonDisabled
                        ]}
                    >
                        {updateMutation.isPending && (
                            <ActivityIndicator
                                size='small'
                                color={COLORS.white}
                            />
                        )}
                        <Text style={styles.saveButtonText}>
                            {t('common.save')}
                        </Text>
                    </Pressable>
                </View>

                <View style={styles.section}>
                    <View style={styles.billingHeader}>
                        <View style={styles.billingHeaderLeft}>
                            <Text style={styles.sectionTitle}>
                                {t('account.billingHistory')}
                            </Text>
                            <Text style={styles.sectionDescription}>
                                {t('account.billingDescription')}
                            </Text>
                        </View>
                        {billingTotal > 0 && (
                            <Pressable
                                onPress={handleManageBilling}
                                style={styles.manageBillingButton}
                            >
                                {isPortalLoading ? (
                                    <ActivityIndicator
                                        size='small'
                                        color={COLORS.black}
                                    />
                                ) : (
                                    <Fragment>
                                        <Text style={styles.manageBillingText}>
                                            {t('account.manageBilling')}
                                        </Text>
                                        <ArrowSquareOut
                                            size={14}
                                            color={COLORS.black}
                                        />
                                    </Fragment>
                                )}
                            </Pressable>
                        )}
                    </View>

                    {isBillingLoading ? (
                        <View style={styles.billingList}>
                            <BillingSkeleton />
                            <BillingSkeleton />
                            <BillingSkeleton />
                        </View>
                    ) : isBillingError ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyTitle}>
                                {t('account.failedToLoadBilling')}
                            </Text>
                            <Pressable
                                onPress={() => refetchBilling()}
                                style={styles.retryButton}
                            >
                                <Text style={styles.retryText}>
                                    {t('common.tryAgain')}
                                </Text>
                            </Pressable>
                        </View>
                    ) : allBillingItems.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyTitle}>
                                {t('account.noBillingHistory')}
                            </Text>
                            <Text style={styles.emptyDescription}>
                                {t('account.noBillingHistoryDescription')}
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.billingList}>
                            {allBillingItems.map((order: BillingOrder) => (
                                <BillingOrderItem
                                    key={order.id}
                                    order={order}
                                    onViewInvoice={handleViewInvoice}
                                    isInvoiceLoading={loadingInvoiceIds.has(
                                        order.id
                                    )}
                                />
                            ))}
                            {hasNextPage && (
                                <Pressable
                                    onPress={() => fetchNextPage()}
                                    disabled={isFetchingNextPage}
                                    style={styles.loadMoreButton}
                                >
                                    {isFetchingNextPage ? (
                                        <ActivityIndicator
                                            size='small'
                                            color={COLORS.accent}
                                        />
                                    ) : (
                                        <Text style={styles.loadMoreText}>
                                            {t('mobile.loadMore')}
                                        </Text>
                                    )}
                                </Pressable>
                            )}
                        </View>
                    )}
                </View>

                <Pressable style={styles.signOutButton} onPress={signOut}>
                    <Text style={styles.signOutText}>
                        {t('mobile.signOut')}
                    </Text>
                </Pressable>

                <View style={{ height: insets.bottom + SPACING.xl }} />
            </ScrollView>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background
    },
    header: {
        paddingHorizontal: SPACING.lg,
        paddingTop: SPACING.lg,
        paddingBottom: SPACING.md
    },
    title: {
        ...TYPOGRAPHY.title,
        color: COLORS.text
    },
    scrollView: {
        flex: 1,
        paddingHorizontal: SPACING.lg
    },
    scrollContent: {
        gap: SPACING.md,
        paddingBottom: SPACING.lg
    },
    section: {
        backgroundColor: COLORS.containerBackground,
        borderWidth: 1,
        borderColor: COLORS.containerBorder,
        borderRadius: 12,
        padding: SPACING.lg
    },
    profileHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.md
    },
    avatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
        overflow: 'hidden'
    },
    avatarGradient: {
        width: 56,
        height: 56,
        alignItems: 'center',
        justifyContent: 'center'
    },
    avatarText: {
        color: COLORS.white,
        fontSize: 22,
        fontFamily: 'ClashDisplay-Bold'
    },
    profileInfo: {
        flex: 1,
        minWidth: 0
    },
    profileName: {
        ...TYPOGRAPHY.subtitle,
        color: COLORS.text
    },
    profileEmail: {
        ...TYPOGRAPHY.caption,
        color: COLORS.textMuted,
        marginTop: 2
    },
    joinedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 2
    },
    profileJoined: {
        ...TYPOGRAPHY.caption,
        color: COLORS.textDim
    },
    statsRow: {
        flexDirection: 'row',
        gap: SPACING.lg,
        marginTop: SPACING.lg,
        paddingTop: SPACING.lg,
        borderTopWidth: 1,
        borderTopColor: COLORS.border
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.xs
    },
    statValue: {
        fontSize: 14,
        fontFamily: 'Satoshi-Bold',
        color: COLORS.text
    },
    statLabel: {
        ...TYPOGRAPHY.caption,
        color: COLORS.textMuted
    },
    sectionTitle: {
        ...TYPOGRAPHY.label,
        color: COLORS.text,
        marginBottom: SPACING.sm
    },
    sectionDescription: {
        ...TYPOGRAPHY.caption,
        color: COLORS.textMuted
    },
    nameInput: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 8,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        color: COLORS.text,
        fontSize: 14,
        fontFamily: 'Satoshi-Regular',
        marginBottom: SPACING.md
    },
    saveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: SPACING.sm,
        backgroundColor: COLORS.accent,
        borderRadius: 8,
        paddingVertical: SPACING.sm,
        alignSelf: 'flex-end',
        paddingHorizontal: SPACING.xl
    },
    saveButtonDisabled: {
        opacity: 0.4
    },
    saveButtonText: {
        color: COLORS.white,
        fontSize: 14,
        fontFamily: 'Satoshi-Bold'
    },
    billingHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: SPACING.lg
    },
    billingHeaderLeft: {
        flex: 1,
        marginRight: SPACING.sm
    },
    manageBillingButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        borderRadius: 8,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.xs,
        backgroundColor: COLORS.white
    },
    manageBillingText: {
        fontSize: 12,
        fontFamily: 'Satoshi-Medium',
        color: COLORS.black
    },
    billingList: {
        gap: 6
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: SPACING.xxl
    },
    emptyTitle: {
        ...TYPOGRAPHY.label,
        color: COLORS.text,
        marginBottom: SPACING.sm
    },
    emptyDescription: {
        ...TYPOGRAPHY.caption,
        color: COLORS.textMuted,
        textAlign: 'center'
    },
    retryButton: {
        backgroundColor: COLORS.accent,
        paddingHorizontal: SPACING.xl,
        paddingVertical: SPACING.sm,
        borderRadius: 8,
        marginTop: SPACING.md
    },
    retryText: {
        color: COLORS.white,
        fontFamily: 'Satoshi-Bold',
        fontSize: 14
    },
    loadMoreButton: {
        alignItems: 'center',
        paddingVertical: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 8,
        marginTop: SPACING.sm
    },
    loadMoreText: {
        ...TYPOGRAPHY.caption,
        color: COLORS.accent,
        fontFamily: 'Satoshi-Medium'
    },
    signOutButton: {
        backgroundColor: 'rgba(239,68,68,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.2)',
        borderRadius: 10,
        paddingVertical: 14,
        alignItems: 'center'
    },
    signOutText: {
        color: COLORS.destructive,
        fontSize: 16,
        fontFamily: 'Satoshi-Bold'
    }
})

export default AccountScreen