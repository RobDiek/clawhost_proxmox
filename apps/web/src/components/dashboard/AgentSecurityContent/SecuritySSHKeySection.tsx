import type { FC, ReactNode } from 'react'
import type { SecuritySSHKeySectionProps } from '@/ts/Interfaces'

import { useState } from 'react'
import { t } from '@openclaw/i18n'
import { KeyIcon, FloppyDiskIcon } from '@phosphor-icons/react'
import {
    Button,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger
} from '@/components/ui'
import { useUpdateAgentSSHKey, useToast } from '@/hooks'
import { PATHS } from '@/lib'
import SecuritySection from '@/components/dashboard/AgentSecurityContent/SecuritySection'

const SecuritySSHKeySection: FC<SecuritySSHKeySectionProps> = ({
    agentId,
    sshKeyId,
    sshKeys,
    readOnly
}): ReactNode => {
    const updateSSHKey = useUpdateAgentSSHKey()
    const toast = useToast()
    const [selectedKeyId, setSelectedKeyId] = useState<string>(sshKeyId || 'none')

    const hasChanged = selectedKeyId !== (sshKeyId || 'none')

    const selectedKey = selectedKeyId !== 'none'
        ? sshKeys.find((k) => k.id === selectedKeyId)
        : null

    const handleSave = () => {
        const newKeyId = selectedKeyId === 'none' ? null : selectedKeyId
        updateSSHKey.mutate(
            { id: agentId, sshKeyId: newKeyId },
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
                    <div className='flex items-center gap-2'>
                        <Select
                            value={selectedKeyId}
                            onValueChange={setSelectedKeyId}
                            disabled={updateSSHKey.isPending}
                        >
                            <SelectTrigger
                                className='w-full'
                                placeholder={
                                    selectedKey
                                        ? selectedKey.name
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
                        {hasChanged && (
                            <Button
                                type='button'
                                variant='secondary'
                                size='icon'
                                onClick={handleSave}
                                disabled={updateSSHKey.isPending}
                            >
                                <FloppyDiskIcon className='h-4 w-4' />
                            </Button>
                        )}
                    </div>
                    {selectedKey && (
                        <p className='text-muted-foreground truncate font-mono text-xs'>
                            {selectedKey.fingerprint}
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
                    {!readOnly && (
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
                    )}
                </div>
            )}
        </SecuritySection>
    )
}

export default SecuritySSHKeySection