import type { FC, ReactNode } from 'react'
import type { ClawSecurityContentProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { ShieldCheckIcon, FingerprintIcon } from '@phosphor-icons/react'
import { Skeleton } from '@/components/ui'
import { CopyableField } from '@/components/dashboard'
import {
    useClawCredentials,
    useRotatePassword,
    useRotateGatewayToken,
    useToast
} from '@/hooks'
import { generatePassword, generateToken } from '@/lib/claw-utils'
import SecuritySection from '@/components/dashboard/ClawSecurityContent/SecuritySection'
import SecretField from '@/components/dashboard/ClawSecurityContent/SecretField'
import SecuritySSHKeySection from '@/components/dashboard/ClawSecurityContent/SecuritySSHKeySection'

const DEMO_PASSWORD = 'x9Kf2mPq7wLn4R'
const DEMO_TOKEN = 'gw_demo_4a8b2c1d3e5f6789'

const ClawSecurityContent: FC<ClawSecurityContentProps> = ({
    claw,
    sshKeys,
    readOnly
}): ReactNode => {
    const credentials = useClawCredentials(readOnly ? '' : claw.id)
    const rotatePassword = useRotatePassword()
    const rotateGatewayToken = useRotateGatewayToken()
    const toast = useToast()

    const handleSavePassword = () => {
        if (!credentials.password) return
        rotatePassword.mutate(
            { id: claw.id, password: credentials.password },
            {
                onSuccess: () => {
                    toast.success(t('api.passwordRotated'))
                    credentials.confirmPasswordSaved()
                },
                onError: (err) =>
                    toast.error(err.message || t('api.failedToRotatePassword'))
            }
        )
    }

    const handleSaveGatewayToken = () => {
        if (!credentials.gatewayToken) return
        rotateGatewayToken.mutate(
            { id: claw.id, token: credentials.gatewayToken },
            {
                onSuccess: () => {
                    toast.success(t('api.gatewayTokenRotated'))
                    credentials.confirmTokenSaved()
                },
                onError: (err) =>
                    toast.error(
                        err.message || t('api.failedToRotateGatewayToken')
                    )
            }
        )
    }

    return (
        <div className='h-full space-y-4 overflow-y-auto p-5'>
            <SecuritySSHKeySection
                clawId={claw.id}
                sshKeyId={claw.sshKeyId}
                sshKeys={sshKeys}
                readOnly={readOnly}
            />

            <SecuritySection
                title={t('clawDetail.securityPassword')}
                icon={<ShieldCheckIcon className='h-4 w-4 text-blue-500' />}
            >
                {!readOnly && credentials.loading ? (
                    <Skeleton className='h-10 w-full rounded-lg' />
                ) : (
                    <SecretField
                        value={readOnly ? DEMO_PASSWORD : credentials.password}
                        onChange={credentials.setPassword}
                        onRandomize={() =>
                            credentials.setPassword(generatePassword())
                        }
                        onSave={handleSavePassword}
                        placeholder={t('createClaw.rootPasswordPlaceholder')}
                        saveTooltip={t('clawDetail.securitySavePassword')}
                        hasChanges={readOnly ? false : credentials.passwordChanged}
                        saving={rotatePassword.isPending}
                        readOnly={readOnly}
                    />
                )}
            </SecuritySection>

            <SecuritySection
                title={t('clawDetail.securityGatewayToken')}
                icon={<ShieldCheckIcon className='h-4 w-4 text-purple-500' />}
            >
                {!readOnly && credentials.loading ? (
                    <Skeleton className='h-10 w-full rounded-lg' />
                ) : (
                    <SecretField
                        value={readOnly ? DEMO_TOKEN : credentials.gatewayToken}
                        onChange={credentials.setGatewayToken}
                        onRandomize={() =>
                            credentials.setGatewayToken(generateToken())
                        }
                        onSave={handleSaveGatewayToken}
                        placeholder={t('createClaw.gatewayTokenPlaceholder')}
                        saveTooltip={t('clawDetail.securitySaveToken')}
                        hasChanges={readOnly ? false : credentials.tokenChanged}
                        saving={rotateGatewayToken.isPending}
                        readOnly={readOnly}
                    />
                )}
            </SecuritySection>

            {claw.hostKeyFingerprint && (
                <SecuritySection
                    title={t('clawDetail.securityHostKey')}
                    icon={
                        <FingerprintIcon className='h-4 w-4 text-emerald-500' />
                    }
                >
                    <CopyableField
                        label={t('clawDetail.securityHostKey')}
                        value={claw.hostKeyFingerprint}
                    />
                </SecuritySection>
            )}
        </div>
    )
}

export default ClawSecurityContent