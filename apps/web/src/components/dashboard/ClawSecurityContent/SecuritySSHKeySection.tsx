import type { FC, ReactNode } from 'react'
import type { SecuritySSHKeySectionProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { KeyIcon } from '@phosphor-icons/react'
import {
    Button,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger
} from '@/components/ui'
import { useUpdateClawSSHKey, useToast } from '@/hooks'
import { PATHS } from '@/lib'
import SecuritySection from '@/components/dashboard/ClawSecurityContent/SecuritySection'

const SecuritySSHKeySection: FC<SecuritySSHKeySectionProps> = ({
    clawId,
    sshKeyId,
    sshKeys
}): ReactNode => {
    const updateSSHKey = useUpdateClawSSHKey()
    const toast = useToast()

    const attachedKey = sshKeyId
        ? sshKeys.find((k) => k.id === sshKeyId)
        : null

    const handleChange = (value: string) => {
        const newKeyId = value === 'none' ? null : value
        updateSSHKey.mutate(
            { id: clawId, sshKeyId: newKeyId },
            {
                onSuccess: () => toast.success(t('api.sshKeyUpdated')),
                onError: (err) =>
                    toast.error(err.message || t('api.failedToUpdateSSHKey'))
            }
        )
    }

    return (
        <SecuritySection
            title={t('clawDetail.securitySSHKey')}
            icon={<KeyIcon className='h-4 w-4 text-amber-500' />}
        >
            {sshKeys.length > 0 ? (
                <div className='space-y-2'>
                    <Select
                        value={sshKeyId || 'none'}
                        onValueChange={handleChange}
                        disabled={updateSSHKey.isPending}
                    >
                        <SelectTrigger
                            className='w-full'
                            placeholder={
                                attachedKey
                                    ? attachedKey.name
                                    : t('common.none')
                            }
                        />
                        <SelectContent>
                            <SelectItem value='none'>
                                {t('common.none')}
                            </SelectItem>
                            {sshKeys.map((key) => (
                                <SelectItem key={key.id} value={key.id}>
                                    {key.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {attachedKey && (
                        <p className='text-muted-foreground truncate font-mono text-xs'>
                            {attachedKey.fingerprint}
                        </p>
                    )}
                    <p className='text-muted-foreground text-xs'>
                        {t('clawDetail.securitySSHKeyHint')}
                    </p>
                </div>
            ) : (
                <div className='bg-muted flex items-center gap-3 rounded-lg p-3'>
                    <div className='bg-background flex h-10 w-10 items-center justify-center rounded-full'>
                        <KeyIcon className='text-muted-foreground h-5 w-5' />
                    </div>
                    <div className='flex-1'>
                        <p className='text-sm font-medium'>
                            {t('createClaw.noSshKeysConfigured')}
                        </p>
                        <p className='text-muted-foreground text-xs'>
                            {t('createClaw.addSshKeyForPasswordlessLogin')}
                        </p>
                    </div>
                    <Button
                        type='button'
                        variant='secondary'
                        size='sm'
                        onClick={() =>
                            window.location.assign(`/${PATHS.SSH_KEYS}`)
                        }
                    >
                        {t('common.addKey')}
                    </Button>
                </div>
            )}
        </SecuritySection>
    )
}

export default SecuritySSHKeySection