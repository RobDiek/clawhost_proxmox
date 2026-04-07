import type { ChangeEvent, FC, KeyboardEvent, ReactNode } from 'react'
import type { CreateClawModalProps } from '@/ts/Interfaces'

import { useState } from 'react'
import { t } from '@openclaw/i18n'
import { useQueryClient } from '@tanstack/react-query'
import { useUIStore } from '@/lib/store'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import Input from '@/components/ui/input'
import Label from '@/components/ui/label'
import {
    ArrowClockwiseIcon,
    EyeIcon,
    EyeSlashIcon
} from '@phosphor-icons/react'
import api from '@electron/shims/api'

const generateReadablePassword = (): string => {
    const words = [
        'sun',
        'moon',
        'star',
        'rain',
        'snow',
        'wind',
        'fire',
        'wave',
        'leaf',
        'tree',
        'rock',
        'bird',
        'fish',
        'bear',
        'wolf',
        'fox',
        'deer',
        'hawk',
        'rose',
        'sage',
        'mint',
        'pine',
        'oak',
        'elm',
        'blue',
        'red',
        'gold',
        'jade',
        'ruby',
        'onyx'
    ]
    const pick = () => words[Math.floor(Math.random() * words.length)]
    const num = Math.floor(Math.random() * 90 + 10)
    return `${pick()}-${pick()}-${num}`
}

const generateToken = (): string => {
    const chars = 'abcdef0123456789'
    let token = ''
    for (let i = 0; i < 64; i++) {
        token += chars[Math.floor(Math.random() * chars.length)]
    }
    return token
}

const CreateClawModal: FC<CreateClawModalProps> = ({ onClose }): ReactNode => {
    const [name, setName] = useState('')
    const [gatewayToken, setGatewayToken] = useState('')
    const [password, setPassword] = useState('')
    const [showToken, setShowToken] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const queryClient = useQueryClient()
    const showToast = useUIStore((s) => s.showToast)

    const nameValid = name.length === 0 || /^[a-zA-Z0-9-]+$/.test(name)

    const handleCreate = async (): Promise<void> => {
        if (!nameValid) {
            setError(t('createClaw.clawNameInvalidChars'))
            return
        }

        setLoading(true)
        setError('')

        try {
            await api.createClaw({
                name,
                ...(gatewayToken && { gatewayToken }),
                ...(password && { password })
            } as never)
            await queryClient.invalidateQueries({ queryKey: ['claws'] })
            showToast(t('createClaw.clawCreated'), 'success')
            onClose()
        } catch (err) {
            const message =
                err instanceof Error
                    ? err.message
                    : t('errors.somethingWentWrong')
            setError(message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) onClose()
            }}
        >
            <DialogContent className='sm:max-w-md'>
                <DialogHeader>
                    <DialogTitle>{t('createClaw.title')}</DialogTitle>
                </DialogHeader>

                <div className='space-y-4 py-4'>
                    <div className='space-y-2'>
                        <Label>{t('createClaw.clawName')}</Label>
                        <Input
                            value={name}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                setName(e.target.value)
                                setError('')
                            }}
                            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                                if (
                                    e.key === 'Enter' &&
                                    nameValid &&
                                    !loading
                                ) {
                                    handleCreate()
                                }
                            }}
                            placeholder={t('createClaw.clawNamePlaceholder')}
                            autoFocus
                        />
                        <p className='text-muted-foreground text-xs'>
                            {t('createClaw.autoGenerateNameHint')}
                        </p>
                    </div>

                    <div className='space-y-2'>
                        <Label>{t('dashboard.gatewayToken')}</Label>
                        <div className='flex gap-2'>
                            <div className='relative flex-1'>
                                <Input
                                    value={gatewayToken}
                                    onChange={(
                                        e: ChangeEvent<HTMLInputElement>
                                    ) => setGatewayToken(e.target.value)}
                                    type={showToken ? 'text' : 'password'}
                                    placeholder={t(
                                        'createClaw.gatewayTokenPlaceholder'
                                    )}
                                    className='pr-9'
                                />
                                <button
                                    type='button'
                                    onClick={() => setShowToken(!showToken)}
                                    className='text-muted-foreground hover:text-foreground absolute right-2.5 top-1/2 -translate-y-1/2'
                                >
                                    {showToken ? (
                                        <EyeSlashIcon className='h-4 w-4' />
                                    ) : (
                                        <EyeIcon className='h-4 w-4' />
                                    )}
                                </button>
                            </div>
                            <Button
                                type='button'
                                variant='outline'
                                size='icon'
                                onClick={() => setGatewayToken(generateToken())}
                                className='h-9 w-9 shrink-0'
                            >
                                <ArrowClockwiseIcon className='h-4 w-4' />
                            </Button>
                        </div>
                        <p className='text-muted-foreground text-xs'>
                            {t('createClaw.autoGenerateGatewayTokenHint')}
                        </p>
                    </div>

                    <div className='space-y-2'>
                        <Label>{t('createClaw.rootPassword')}</Label>
                        <div className='flex gap-2'>
                            <div className='relative flex-1'>
                                <Input
                                    value={password}
                                    onChange={(
                                        e: ChangeEvent<HTMLInputElement>
                                    ) => setPassword(e.target.value)}
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder={t(
                                        'createClaw.rootPasswordPlaceholder'
                                    )}
                                    className='pr-9'
                                />
                                <button
                                    type='button'
                                    onClick={() =>
                                        setShowPassword(!showPassword)
                                    }
                                    className='text-muted-foreground hover:text-foreground absolute right-2.5 top-1/2 -translate-y-1/2'
                                >
                                    {showPassword ? (
                                        <EyeSlashIcon className='h-4 w-4' />
                                    ) : (
                                        <EyeIcon className='h-4 w-4' />
                                    )}
                                </button>
                            </div>
                            <Button
                                type='button'
                                variant='outline'
                                size='icon'
                                onClick={() => {
                                    setPassword(generateReadablePassword())
                                    setShowPassword(true)
                                }}
                                className='h-9 w-9 shrink-0'
                            >
                                <ArrowClockwiseIcon className='h-4 w-4' />
                            </Button>
                        </div>
                        <p className='text-muted-foreground text-xs'>
                            {t('createClaw.autoGeneratePasswordHint')}
                        </p>
                    </div>

                    {error && <p className='text-sm text-red-400'>{error}</p>}
                </div>

                <DialogFooter>
                    <Button
                        variant='ghost'
                        onClick={onClose}
                        disabled={loading}
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button
                        onClick={handleCreate}
                        disabled={!nameValid || loading}
                    >
                        {loading
                            ? t('createClaw.creating')
                            : t('createClaw.title')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default CreateClawModal