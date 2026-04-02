import type { FC, ReactNode } from 'react'
import type { SSHKeyGenerateFormProps } from '@/ts/Interfaces'

import { Fragment } from 'react'
import { t } from '@openclaw/i18n'
import { COPIED_FIELD_TYPE } from '@/lib/constants'
import {
    Button,
    Input,
    Label,
    Card,
    CardContent,
    Alert,
    AlertDescription,
    Tooltip,
    TooltipTrigger,
    TooltipContent
} from '@/components/ui'
import {
    KeyIcon,
    CircleNotchIcon,
    CopyIcon,
    CheckIcon,
    DownloadIcon,
    WarningIcon
} from '@phosphor-icons/react'

const sshKeygenCommand = 'ssh-keygen -t ed25519 -C "your-email@example.com"'

const SSHKeyGenerateForm: FC<SSHKeyGenerateFormProps> = ({
    name,
    generatedKeys,
    copied,
    isPending,
    onNameChange,
    onGenerateKeyPair,
    onCopyToClipboard,
    onDownloadPrivateKey,
    onSubmit,
    onClose
}): ReactNode => {
    return (
        <div className='space-y-4'>
            <div className='space-y-2'>
                <Label>{t('sshKeys.keyName')}</Label>
                <Input
                    type='text'
                    value={name}
                    onChange={(e) => onNameChange(e.target.value)}
                    placeholder={t('sshKeys.keyNamePlaceholder')}
                    required
                />
            </div>

            {!generatedKeys ? (
                <Fragment>
                    <Alert>
                        <WarningIcon className='h-4 w-4' />
                        <AlertDescription>
                            <strong>{t('sshKeys.important')}</strong>{' '}
                            {t('sshKeys.importantAfterGenerating')}
                        </AlertDescription>
                    </Alert>

                    <Button
                        onClick={onGenerateKeyPair}
                        className='w-full'
                        disabled={!name}
                    >
                        <KeyIcon className='mr-2 h-4 w-4' />
                        {t('sshKeys.generateKeyPair')}
                    </Button>

                    <div className='relative'>
                        <div className='absolute inset-0 flex items-center'>
                            <span className='w-full border-t' />
                        </div>
                        <div className='relative flex justify-center text-xs uppercase'>
                            <span className='bg-background text-muted-foreground px-2'>
                                {t('sshKeys.orGenerateLocallyRecommended')}
                            </span>
                        </div>
                    </div>

                    <Card className='bg-muted/50 rounded-xl'>
                        <CardContent className='py-3'>
                            <p className='text-muted-foreground mb-2 text-sm'>
                                {t('sshKeys.runThisInYourTerminal')}
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
                                            {copied ===
                                            COPIED_FIELD_TYPE.COMMAND ? (
                                                <CheckIcon className='h-4 w-4' />
                                            ) : (
                                                <CopyIcon className='h-4 w-4' />
                                            )}
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {t('common.copy')}
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                            <p className='text-muted-foreground mt-2 text-xs'>
                                {t('sshKeys.thenSwitchToIHave')}
                            </p>
                        </CardContent>
                    </Card>
                </Fragment>
            ) : (
                <Fragment>
                    <Alert variant='destructive'>
                        <WarningIcon className='h-4 w-4' />
                        <AlertDescription>
                            {t('sshKeys.savePrivateKeyNow')}
                        </AlertDescription>
                    </Alert>

                    <div className='space-y-2'>
                        <Label>{t('sshKeys.privateKeyKeepSecret')}</Label>
                        <div className='relative'>
                            <textarea
                                className='bg-background h-24 w-full resize-none rounded-md border px-3 py-2 font-mono text-xs'
                                value={generatedKeys.privateKey}
                                readOnly
                            />
                        </div>
                        <div className='flex gap-2'>
                            <Button
                                variant='outline'
                                size='sm'
                                onClick={onDownloadPrivateKey}
                            >
                                <DownloadIcon className='mr-2 h-4 w-4' />
                                {t('sshKeys.downloadPrivateKey')}
                            </Button>
                            <Button
                                variant='outline'
                                size='sm'
                                onClick={() =>
                                    onCopyToClipboard(
                                        generatedKeys.privateKey,
                                        COPIED_FIELD_TYPE.PRIVATE
                                    )
                                }
                            >
                                {copied === COPIED_FIELD_TYPE.PRIVATE ? (
                                    <CheckIcon className='mr-2 h-4 w-4' />
                                ) : (
                                    <CopyIcon className='mr-2 h-4 w-4' />
                                )}
                                {t('common.copy')}
                            </Button>
                        </div>
                    </div>

                    <div className='space-y-2'>
                        <Label>{t('sshKeys.publicKeyWillBeSaved')}</Label>
                        <textarea
                            className='bg-muted h-16 w-full resize-none rounded-md border px-3 py-2 font-mono text-xs'
                            value={generatedKeys.publicKey}
                            readOnly
                        />
                    </div>

                    <div className='flex gap-3 pt-2'>
                        <Button
                            type='button'
                            variant='outline'
                            className='flex-1'
                            onClick={onClose}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            className='flex-1'
                            onClick={() => onSubmit()}
                            disabled={isPending}
                        >
                            {isPending && (
                                <CircleNotchIcon className='mr-2 h-4 w-4 animate-spin' />
                            )}
                            {t('sshKeys.savePublicKey')}
                        </Button>
                    </div>
                </Fragment>
            )}
        </div>
    )
}

export default SSHKeyGenerateForm