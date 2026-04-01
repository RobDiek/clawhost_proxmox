import type { FC, ReactNode } from 'react'
import type { AdvancedOptionsProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { useUIStore } from '@/lib/store'
import { copyToClipboard } from '@/lib'
import { generatePassword } from '@/lib/claw-utils'
import {
    Button,
    Input,
    Slider,
    Label,
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    TooltipProvider
} from '@/components/ui'
import {
    EyeIcon,
    EyeSlashIcon,
    KeyIcon,
    CopyIcon,
    ArrowClockwiseIcon,
    CaretDownIcon
} from '@phosphor-icons/react'
import { ClawMascot } from '@/components/shared'

const AdvancedOptions: FC<AdvancedOptionsProps> = ({
    showAdvanced,
    onToggleAdvanced,
    password,
    onPasswordChange,
    showPassword,
    onToggleShowPassword,
    sshKeys,
    selectedSshKeyId,
    onSshKeyChange,
    onNavigateToSSHKeys,
    volumePricing,
    volumeSize,
    onVolumeSizeChange
}): ReactNode => {
    const { showToast } = useUIStore()

    return (
        <div className='bg-muted/50 border-border rounded-lg border'>
            <button
                type='button'
                onClick={onToggleAdvanced}
                className='text-muted-foreground hover:text-foreground flex w-full items-center gap-2 p-4 text-sm transition-colors'
            >
                <CaretDownIcon
                    className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                />
                {t('createClaw.advancedOptions')}
            </button>

            {showAdvanced && (
                <div className='border-border/50 space-y-5 border-t p-4'>
                    <div className='space-y-2'>
                        <Label>{t('createClaw.rootPassword')}</Label>
                        <div className='flex items-center gap-2'>
                            <div className='relative flex-1'>
                                <Input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) =>
                                        onPasswordChange(e.target.value)
                                    }
                                    placeholder={t(
                                        'createClaw.rootPasswordPlaceholder'
                                    )}
                                    className='bg-muted pr-10 font-mono text-sm'
                                />
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type='button'
                                            onClick={onToggleShowPassword}
                                            className='text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2'
                                        >
                                            {showPassword ? (
                                                <EyeSlashIcon className='h-4 w-4' />
                                            ) : (
                                                <EyeIcon className='h-4 w-4' />
                                            )}
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {showPassword
                                            ? t('common.hide')
                                            : t('common.show')}
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        type='button'
                                        variant='ghost'
                                        size='icon'
                                        onClick={async () => {
                                            await copyToClipboard(password)
                                            showToast(
                                                t('createClaw.passwordCopied'),
                                                'success'
                                            )
                                        }}
                                    >
                                        <CopyIcon className='h-4 w-4' />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {t('common.copy')}
                                </TooltipContent>
                            </Tooltip>
                            <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            type='button'
                                            variant='ghost'
                                            size='icon'
                                            onClick={() =>
                                                onPasswordChange(
                                                    generatePassword()
                                                )
                                            }
                                        >
                                            <ArrowClockwiseIcon className='h-4 w-4' />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {t('createClaw.regeneratePassword')}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                        <p className='text-muted-foreground text-xs'>
                            {t('createClaw.autoGeneratePasswordHint')}
                        </p>
                    </div>

                    <div className='space-y-2'>
                        <Label>{t('createClaw.sshKeyOptional')}</Label>
                        {sshKeys.length > 0 ? (
                            <div className='space-y-2'>
                                <label
                                    className={`flex cursor-pointer items-center rounded-lg p-3 transition ${
                                        selectedSshKeyId === ''
                                            ? 'border border-[#ef5350]/50 bg-[#ef5350]/20'
                                            : 'bg-muted hover:bg-muted/80 border border-transparent'
                                    }`}
                                >
                                    <input
                                        type='radio'
                                        name='sshKey'
                                        value=''
                                        checked={selectedSshKeyId === ''}
                                        onChange={() => onSshKeyChange('')}
                                        className='sr-only'
                                    />
                                    <span className='text-sm'>
                                        {t('createClaw.noSshKeyPasswordOnly')}
                                    </span>
                                </label>
                                {sshKeys.map((key) => (
                                    <label
                                        key={key.id}
                                        className={`flex cursor-pointer items-center rounded-lg p-3 transition ${
                                            selectedSshKeyId === key.id
                                                ? 'border border-[#ef5350]/50 bg-[#ef5350]/20'
                                                : 'bg-muted hover:bg-muted/80 border border-transparent'
                                        }`}
                                    >
                                        <input
                                            type='radio'
                                            name='sshKey'
                                            value={key.id}
                                            checked={
                                                selectedSshKeyId === key.id
                                            }
                                            onChange={() =>
                                                onSshKeyChange(key.id)
                                            }
                                            className='sr-only'
                                        />
                                        <KeyIcon className='text-muted-foreground mr-3 h-4 w-4' />
                                        <div>
                                            <p className='text-sm font-medium'>
                                                {key.name}
                                            </p>
                                            <p className='text-muted-foreground font-mono text-xs'>
                                                {key.fingerprint}
                                            </p>
                                        </div>
                                    </label>
                                ))}
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
                                        {t(
                                            'createClaw.addSshKeyForPasswordlessLogin'
                                        )}
                                    </p>
                                </div>
                                <Button
                                    type='button'
                                    variant='secondary'
                                    size='sm'
                                    onClick={onNavigateToSSHKeys}
                                >
                                    {t('common.addKey')}
                                </Button>
                            </div>
                        )}
                    </div>

                    {volumePricing && (
                        <div className='space-y-2'>
                            <Label>
                                {t('createClaw.additionalStorageOptional')}
                            </Label>
                            <div
                                className={`bg-muted space-y-4 rounded-lg p-4`}
                            >
                                <div className='flex items-center justify-between'>
                                    <div className='flex items-center gap-2'>
                                        <ClawMascot className='h-4 w-4' />
                                        <span className='text-sm font-medium'>
                                            {t('createClaw.volumeStorage')}
                                        </span>
                                    </div>
                                    <span className='text-sm font-semibold'>
                                        {volumeSize > 0
                                            ? `+$${(volumeSize * volumePricing.pricePerGbMonthly).toFixed(2)}${t('landing.perMonth')}`
                                            : t('common.none')}
                                    </span>
                                </div>
                                <div className='space-y-3'>
                                    <Slider
                                        value={[volumeSize]}
                                        onValueChange={(value) =>
                                            onVolumeSizeChange(value[0])
                                        }
                                        min={0}
                                        max={500}
                                        step={10}
                                    />
                                    <div className='flex items-center justify-between'>
                                        <span className='text-muted-foreground text-xs'>
                                            {t('createClaw.volumeMin')}
                                        </span>
                                        <div className='flex items-center gap-2'>
                                            <Input
                                                type='number'
                                                min={0}
                                                max={volumePricing.maxSize}
                                                value={volumeSize}
                                                onChange={(e) => {
                                                    const val = Math.min(
                                                        Math.max(
                                                            0,
                                                            Number(
                                                                e.target.value
                                                            )
                                                        ),
                                                        volumePricing.maxSize
                                                    )
                                                    onVolumeSizeChange(val)
                                                }}
                                                className='h-8 w-20 text-center text-sm'
                                            />
                                            <span className='text-muted-foreground text-sm'>
                                                {t('createClaw.volumeUnit')}
                                            </span>
                                        </div>
                                        <span className='text-muted-foreground text-xs'>
                                            {t('createClaw.volumeMax')}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default AdvancedOptions