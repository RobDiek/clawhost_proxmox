import type { FC, ReactNode } from 'react'
import type { SSHKeyUploadFormProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { COPIED_FIELD_TYPE } from '@/lib/constants'
import {
    Button,
    Input,
    Label,
    Card,
    CardContent,
    Tooltip,
    TooltipTrigger,
    TooltipContent
} from '@/components/ui'
import { CircleNotchIcon, CopyIcon, CheckIcon } from '@phosphor-icons/react'

const sshKeygenCommand = 'ssh-keygen -t ed25519 -C "your-email@example.com"'

const SSHKeyUploadForm: FC<SSHKeyUploadFormProps> = ({
    name,
    publicKey,
    copied,
    isPending,
    onNameChange,
    onPublicKeyChange,
    onCopyToClipboard,
    onSubmit,
    onClose
}): ReactNode => {
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault()
                onSubmit()
            }}
            className='space-y-4'
        >
            <div className='space-y-2'>
                <Label>{t('sshKeys.name')}</Label>
                <Input
                    type='text'
                    value={name}
                    onChange={(e) => onNameChange(e.target.value)}
                    placeholder={t('sshKeys.namePlaceholder')}
                    required
                />
            </div>

            <div className='space-y-2'>
                <Label>{t('sshKeys.publicKey')}</Label>
                <textarea
                    className='bg-background focus:ring-primary h-32 w-full resize-none rounded-md border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2'
                    value={publicKey}
                    onChange={(e) => onPublicKeyChange(e.target.value)}
                    placeholder={t('sshKeys.publicKeyPlaceholder')}
                    required
                />
                <p className='text-muted-foreground text-xs'>
                    {t('sshKeys.publicKeyHint')}{' '}
                    <code className='bg-muted rounded px-1'>
                        {t('sshKeys.publicKeyPath1')}
                    </code>{' '}
                    {t('sshKeys.publicKeyPathOr')}{' '}
                    <code className='bg-muted rounded px-1'>
                        {t('sshKeys.publicKeyPath2')}
                    </code>
                </p>
            </div>

            <Card className='bg-muted/50 rounded-xl'>
                <CardContent className='py-3'>
                    <p className='text-muted-foreground mb-2 text-sm'>
                        {t('sshKeys.dontHaveSshKey')}
                    </p>
                    <div className='flex items-center gap-2'>
                        <code className='bg-background flex-1 overflow-x-auto rounded-lg p-2 font-mono text-xs'>
                            {sshKeygenCommand}
                        </code>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type='button'
                                    variant='ghost'
                                    size='icon'
                                    onClick={() =>
                                        onCopyToClipboard(
                                            sshKeygenCommand,
                                            COPIED_FIELD_TYPE.COMMAND
                                        )
                                    }
                                >
                                    {copied === COPIED_FIELD_TYPE.COMMAND ? (
                                        <CheckIcon className='h-4 w-4' />
                                    ) : (
                                        <CopyIcon className='h-4 w-4' />
                                    )}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('common.copy')}</TooltipContent>
                        </Tooltip>
                    </div>
                </CardContent>
            </Card>

            <div className='flex gap-3 pt-2'>
                <Button
                    type='button'
                    variant='outline'
                    className='flex-1'
                    onClick={onClose}
                >
                    {t('common.cancel')}
                </Button>
                <Button type='submit' className='flex-1' disabled={isPending}>
                    {isPending && (
                        <CircleNotchIcon className='mr-2 h-4 w-4 animate-spin' />
                    )}
                    {t('common.addKey')}
                </Button>
            </div>
        </form>
    )
}

export default SSHKeyUploadForm