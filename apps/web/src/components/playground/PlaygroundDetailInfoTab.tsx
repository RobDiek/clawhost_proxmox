import type { FC, ReactNode } from 'react'
import type { PlaygroundDetailInfoTabProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { clawProvider } from '@openclaw/shared'
import { getLocale } from '@/lib'
import { CopyableField } from '@/components/dashboard'
import { ProviderIcon } from '@/components/shared'
import { Skeleton } from '@/components/ui'
import { locationFlags, locationNames } from '@/lib/claw-utils'

const PlaygroundDetailInfoTab: FC<PlaygroundDetailInfoTabProps> = ({
    claw,
    plans,
    sshKeys,
    fullScreen,
    showVersion,
    versionLoading,
    versionDisplay
}): ReactNode => {
    const plan = plans.find((p) => p.id === claw.planId)
    const monthlyPrice = plan ? plan.priceMonthly : null
    const locationName = claw.location
        ? locationNames[claw.location] || claw.location
        : t('common.unknown')
    const flag = claw.location ? locationFlags[claw.location] : null
    const attachedSshKey = claw.sshKeyId
        ? sshKeys.find((k) => k.id === claw.sshKeyId)
        : null

    return (
        <div className='h-full overflow-y-auto p-5'>
            <div
                className={`grid gap-2 ${fullScreen ? 'grid-cols-3' : 'grid-cols-2'}`}
            >
                {claw.ownerEmail && (
                    <CopyableField
                        label={t('dashboard.owner')}
                        value={claw.ownerEmail}
                    />
                )}

                {claw.ip && (
                    <CopyableField
                        label={t('dashboard.ipAddress')}
                        value={claw.ip}
                    />
                )}

                {claw.provider === clawProvider.local && claw.port && (
                    <CopyableField
                        label={t('dashboard.port')}
                        value={String(claw.port)}
                    />
                )}

                {showVersion && versionLoading && (
                    <div className='bg-foreground/5 rounded-lg px-3 py-2'>
                        <span className='text-muted-foreground block text-xs'>
                            {t('dashboard.version')}
                        </span>
                        <Skeleton className='mt-1 h-5 w-24' />
                    </div>
                )}

                {showVersion && versionDisplay && (
                    <CopyableField
                        label={t('dashboard.version')}
                        value={versionDisplay}
                    />
                )}

                <CopyableField
                    label={t('dashboard.provider')}
                    value={
                        claw.provider === clawProvider.local
                            ? t('createClaw.providerLocal')
                            : t('createClaw.providerHetzner')
                    }
                    icon={
                        <ProviderIcon
                            provider={claw.provider}
                            className='h-3.5 w-3.5 shrink-0'
                        />
                    }
                />

                {claw.provider !== clawProvider.local && (
                    <CopyableField
                        label={t('dashboard.location')}
                        value={`${flag || ''} ${locationName}`.trim()}
                    />
                )}

                {claw.provider !== clawProvider.local && (
                    <CopyableField
                        label={t('dashboard.plan')}
                        value={
                            plan
                                ? `${plan.name.replace(/([A-Za-z])(\d)/, '$1 $2')} (${plan.cpu} vCPU, ${plan.memory}GB RAM, ${plan.disk}GB SSD)`
                                : claw.planId
                        }
                    />
                )}

                {claw.provider !== clawProvider.local && monthlyPrice && (
                    <CopyableField
                        label={t('dashboard.planCost')}
                        value={
                            claw.billingInterval === 'year' && plan
                                ? `$${plan.priceYearly.toFixed(0)}${t('landing.perYear')}`
                                : `$${monthlyPrice.toFixed(0)}${t('landing.perMonth')}`
                        }
                    />
                )}

                {claw.providerServerId && (
                    <CopyableField
                        label={t('dashboard.serverId')}
                        value={`#${claw.providerServerId}`}
                    />
                )}

                {claw.createdAt && (
                    <CopyableField
                        label={t('dashboard.created')}
                        value={new Date(claw.createdAt).toLocaleDateString(
                            getLocale(),
                            {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                            }
                        )}
                    />
                )}

                {attachedSshKey && (
                    <CopyableField
                        label={t('dashboard.sshKey')}
                        value={attachedSshKey.name}
                    />
                )}

                {claw.currentPeriodStart && (
                    <CopyableField
                        label={t('dashboard.lastBilling')}
                        value={new Date(
                            claw.currentPeriodStart
                        ).toLocaleDateString(getLocale(), {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                        })}
                    />
                )}

                {claw.currentPeriodEnd && (
                    <CopyableField
                        label={t('dashboard.nextBilling')}
                        value={new Date(
                            claw.currentPeriodEnd
                        ).toLocaleDateString(getLocale(), {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                        })}
                    />
                )}

                {claw.volumes && claw.volumes.length > 0 && (
                    <CopyableField
                        label={t('dashboard.storage')}
                        value={`${claw.volumes.reduce((sum, v) => sum + v.size, 0)} GB`}
                    />
                )}

                {claw.gatewayToken && (
                    <CopyableField
                        label={t('dashboard.gatewayToken')}
                        value={claw.gatewayToken}
                        secret
                    />
                )}

                {claw.rootPassword && (
                    <CopyableField
                        label={t('createClaw.rootPassword')}
                        value={claw.rootPassword}
                        secret
                    />
                )}
            </div>
        </div>
    )
}

export default PlaygroundDetailInfoTab