import type { FC, ReactNode } from 'react'
import type {
    CreateSSHKeyModalProps,
    ElectronWindow,
    GeneratedKeyPair,
    SSHKeyCardProps
} from '@/ts/Interfaces'
import type { CopiedFieldType, SSHKeyModalMode } from '@/ts/Types'

import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { useAuth } from '@/lib/auth'
import { useUIStore, usePreferencesStore } from '@/lib/store'
import { ROUTES, copyToClipboard as copyText, getBaseDomain } from '@/lib'
import {
    useSSHKeys,
    useCreateSSHKey,
    useDeleteSSHKey,
    useUserStats,
    useProfile
} from '@/hooks'
import { getLegalLinks } from '@/data'
import {
    Button,
    Input,
    Label,
    Card,
    CardContent,
    Skeleton,
    Alert,
    AlertDescription,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    Tooltip,
    TooltipTrigger,
    TooltipContent
} from '@/components/ui'
import {
    EmptyState,
    ErrorState,
    Header,
    LandingFooter,
    Logo,
    LanguageSelector,
    ThemeToggle,
    UserDropdown,
    PageBackground,
    PageTitle,
    PageHeader,
    ActionButton
} from '@/components'
import {
    PlusCircleIcon,
    KeyIcon,
    TrashIcon,
    CircleNotchIcon,
    CopyIcon,
    CheckIcon,
    DownloadIcon,
    WarningIcon,
    CaretDownIcon
} from '@phosphor-icons/react'

const SSHKeySkeleton: FC = (): ReactNode => {
    return (
        <Card>
            <CardContent className='py-4'>
                <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-4'>
                        <Skeleton className='h-10 w-10 rounded-full' />
                        <div className='space-y-2'>
                            <Skeleton className='h-5 w-32' />
                            <Skeleton className='h-4 w-48' />
                        </div>
                    </div>
                    <Skeleton className='h-8 w-8' />
                </div>
            </CardContent>
        </Card>
    )
}

const SSHKeyCard: FC<SSHKeyCardProps> = ({ sshKey }): ReactNode => {
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const deleteMutation = useDeleteSSHKey()

    return (
        <>
            <Card>
                <CardContent className='py-4'>
                    <div className='flex items-center justify-between'>
                        <div className='flex items-center gap-4'>
                            <div className='bg-muted flex h-10 w-10 items-center justify-center rounded-full'>
                                <KeyIcon className='text-muted-foreground h-5 w-5' />
                            </div>
                            <div>
                                <h3 className='font-semibold'>{sshKey.name}</h3>
                                <p className='text-muted-foreground font-mono text-sm'>
                                    {sshKey.fingerprint}
                                </p>
                            </div>
                        </div>

                        <Button
                            variant='ghost'
                            size='icon'
                            onClick={() => setShowDeleteModal(true)}
                            disabled={deleteMutation.isPending}
                        >
                            {deleteMutation.isPending ? (
                                <CircleNotchIcon className='h-5 w-5 animate-spin' />
                            ) : (
                                <TrashIcon className='text-destructive h-5 w-5' />
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('sshKeys.deleteKey')}</DialogTitle>
                        <DialogDescription>
                            {t('sshKeys.deleteKeyConfirmation')}{' '}
                            <strong>{sshKey.name}</strong>?
                        </DialogDescription>
                    </DialogHeader>
                    <div className='mt-4 flex justify-end gap-3'>
                        <Button
                            variant='outline'
                            onClick={() => setShowDeleteModal(false)}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant='destructive'
                            onClick={() => {
                                deleteMutation.mutate(sshKey.id)
                                setShowDeleteModal(false)
                            }}
                            disabled={deleteMutation.isPending}
                        >
                            {deleteMutation.isPending && (
                                <CircleNotchIcon className='h-4 w-4 animate-spin' />
                            )}
                            {t('common.confirm')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}

const CreateSSHKeyModal: FC<CreateSSHKeyModalProps> = ({
    onClose
}): ReactNode => {
    const [mode, setMode] = useState<SSHKeyModalMode>('upload')
    const [name, setName] = useState('')
    const [publicKey, setPublicKey] = useState('')
    const [generatedKeys, setGeneratedKeys] = useState<GeneratedKeyPair | null>(
        null
    )
    const [copied, setCopied] = useState<CopiedFieldType>(null)
    const [keyGenError, setKeyGenError] = useState('')
    const { showToast } = useUIStore()

    const createMutation = useCreateSSHKey()

    const handleCreate = () => {
        createMutation.mutate(
            {
                name,
                publicKey:
                    mode === 'generate' && generatedKeys
                        ? generatedKeys.publicKey
                        : publicKey
            },
            {
                onSuccess: () => {
                    showToast(t('sshKeys.sshKeyAddedSuccessfully'), 'success')
                    onClose()
                },
                onError: (err: Error) => {
                    showToast(
                        err.message || t('errors.failedToAddSSHKey'),
                        'error'
                    )
                }
            }
        )
    }

    const generateKeyPair = async () => {
        try {
            const keyPair = await crypto.subtle.generateKey(
                {
                    name: 'RSASSA-PKCS1-v1_5',
                    modulusLength: 4096,
                    publicExponent: new Uint8Array([1, 0, 1]),
                    hash: 'SHA-256'
                },
                true,
                ['sign', 'verify']
            )

            const publicKeyJwk = await crypto.subtle.exportKey(
                'jwk',
                keyPair.publicKey
            )
            const privateKeyBuffer = await crypto.subtle.exportKey(
                'pkcs8',
                keyPair.privateKey
            )

            const base64UrlToBytes = (base64url: string): Uint8Array => {
                const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
                const padding = '='.repeat((4 - (base64.length % 4)) % 4)
                const binary = atob(base64 + padding)
                return Uint8Array.from(binary, (c) => c.charCodeAt(0))
            }

            const n = base64UrlToBytes(publicKeyJwk.n!)
            const e = base64UrlToBytes(publicKeyJwk.e!)

            const encodeLength = (len: number): Uint8Array => {
                return new Uint8Array([
                    (len >> 24) & 0xff,
                    (len >> 16) & 0xff,
                    (len >> 8) & 0xff,
                    len & 0xff
                ])
            }

            const keyType = new TextEncoder().encode('ssh-rsa')

            // Ensure modulus has leading zero if high bit is set (SSH mpint format)
            const nWithPadding = n[0] & 0x80 ? new Uint8Array([0, ...n]) : n
            const eWithPadding = e[0] & 0x80 ? new Uint8Array([0, ...e]) : e

            const keyBlob = new Uint8Array([
                ...encodeLength(keyType.length),
                ...keyType,
                ...encodeLength(eWithPadding.length),
                ...eWithPadding,
                ...encodeLength(nWithPadding.length),
                ...nWithPadding
            ])

            const keyBlobBase64 = btoa(String.fromCharCode(...keyBlob))
            const sshPublicKey = `ssh-rsa ${keyBlobBase64} ${name || 'generated-key'}@clawhost`

            const privateKeyBase64 = btoa(
                String.fromCharCode(...new Uint8Array(privateKeyBuffer))
            )
            const pemPrivateKey = `-----BEGIN PRIVATE KEY-----\n${privateKeyBase64.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`

            setGeneratedKeys({
                publicKey: sshPublicKey,
                privateKey: pemPrivateKey
            })
        } catch {
            setKeyGenError(t('errors.failedToGenerateKeyPair'))
        }
    }

    const copyToClipboard = async (
        text: string,
        type: 'command' | 'private'
    ) => {
        await copyText(text)
        setCopied(type)
        setTimeout(() => setCopied(null), 2000)
    }

    const downloadPrivateKey = () => {
        if (!generatedKeys) return
        const blob = new Blob([generatedKeys.privateKey], {
            type: 'text/plain'
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${name || 'id_rsa'}.pem`
        a.click()
        URL.revokeObjectURL(url)
    }

    const sshKeygenCommand = 'ssh-keygen -t ed25519 -C "your-email@example.com"'

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className='max-h-[90vh] max-w-lg overflow-y-auto'>
                <DialogHeader className='pb-1.5'>
                    <DialogTitle>
                        {t('sshKeys.addSshKeyModalTitle')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('sshKeys.addSshKeyModalDescription')}
                    </DialogDescription>
                    <div className='bg-muted !mt-3 flex gap-2 rounded-lg p-1'>
                        <button
                            type='button'
                            onClick={() => setMode('upload')}
                            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                                mode === 'upload'
                                    ? 'bg-background shadow'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {t('sshKeys.iHaveAnSshKey')}
                        </button>
                        <button
                            type='button'
                            onClick={() => setMode('generate')}
                            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                                mode === 'generate'
                                    ? 'bg-background shadow'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {t('sshKeys.generateNewKey')}
                        </button>
                    </div>
                </DialogHeader>

                {keyGenError && (
                    <Alert variant='destructive'>
                        <AlertDescription>{keyGenError}</AlertDescription>
                    </Alert>
                )}

                {mode === 'upload' ? (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault()
                            handleCreate()
                        }}
                        className='space-y-4'
                    >
                        <div className='space-y-2'>
                            <Label>{t('sshKeys.name')}</Label>
                            <Input
                                type='text'
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('sshKeys.namePlaceholder')}
                                required
                            />
                        </div>

                        <div className='space-y-2'>
                            <Label>{t('sshKeys.publicKey')}</Label>
                            <textarea
                                className='bg-background focus:ring-primary h-32 w-full resize-none rounded-md border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2'
                                value={publicKey}
                                onChange={(e) => setPublicKey(e.target.value)}
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
                                                    copyToClipboard(
                                                        sshKeygenCommand,
                                                        'command'
                                                    )
                                                }
                                            >
                                                {copied === 'command' ? (
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
                            <Button
                                type='submit'
                                className='flex-1'
                                disabled={createMutation.isPending}
                            >
                                {createMutation.isPending && (
                                    <CircleNotchIcon className='mr-2 h-4 w-4 animate-spin' />
                                )}
                                {t('common.addKey')}
                            </Button>
                        </div>
                    </form>
                ) : (
                    <div className='space-y-4'>
                        <div className='space-y-2'>
                            <Label>{t('sshKeys.keyName')}</Label>
                            <Input
                                type='text'
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('sshKeys.keyNamePlaceholder')}
                                required
                            />
                        </div>

                        {!generatedKeys ? (
                            <>
                                <Alert>
                                    <WarningIcon className='h-4 w-4' />
                                    <AlertDescription>
                                        <strong>
                                            {t('sshKeys.important')}
                                        </strong>{' '}
                                        {t('sshKeys.importantAfterGenerating')}
                                    </AlertDescription>
                                </Alert>

                                <Button
                                    onClick={generateKeyPair}
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
                                            {t(
                                                'sshKeys.orGenerateLocallyRecommended'
                                            )}
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
                                                            copyToClipboard(
                                                                sshKeygenCommand,
                                                                'command'
                                                            )
                                                        }
                                                    >
                                                        {copied ===
                                                        'command' ? (
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
                            </>
                        ) : (
                            <>
                                <Alert variant='destructive'>
                                    <WarningIcon className='h-4 w-4' />
                                    <AlertDescription>
                                        {t('sshKeys.savePrivateKeyNow')}
                                    </AlertDescription>
                                </Alert>

                                <div className='space-y-2'>
                                    <Label>
                                        {t('sshKeys.privateKeyKeepSecret')}
                                    </Label>
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
                                            onClick={downloadPrivateKey}
                                        >
                                            <DownloadIcon className='mr-2 h-4 w-4' />
                                            {t('sshKeys.downloadPrivateKey')}
                                        </Button>
                                        <Button
                                            variant='outline'
                                            size='sm'
                                            onClick={() =>
                                                copyToClipboard(
                                                    generatedKeys.privateKey,
                                                    'private'
                                                )
                                            }
                                        >
                                            {copied === 'private' ? (
                                                <CheckIcon className='mr-2 h-4 w-4' />
                                            ) : (
                                                <CopyIcon className='mr-2 h-4 w-4' />
                                            )}
                                            {t('common.copy')}
                                        </Button>
                                    </div>
                                </div>

                                <div className='space-y-2'>
                                    <Label>
                                        {t('sshKeys.publicKeyWillBeSaved')}
                                    </Label>
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
                                        onClick={() => handleCreate()}
                                        disabled={createMutation.isPending}
                                    >
                                        {createMutation.isPending && (
                                            <CircleNotchIcon className='mr-2 h-4 w-4 animate-spin' />
                                        )}
                                        {t('sshKeys.savePublicKey')}
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}

const SSHKeys: FC = (): ReactNode => {
    const [showCreate, setShowCreate] = useState(false)
    const { isLocal, user, cachedProfile } = useAuth()
    const { openLinksWindowed } = usePreferencesStore()
    const { data: profile } = useProfile({
        enabled: !!user,
        staleTime: 1000 * 60 * 5
    })

    const [appVersion, setAppVersion] = useState('')

    useEffect(() => {
        if (!isLocal) return
        const api = (window as unknown as ElectronWindow).electronAPI
        if (api?.getAppVersion) {
            api.getAppVersion().then((v) => setAppVersion(`v${v}`))
        }
    }, [isLocal])

    const localDisplayName =
        profile?.name || cachedProfile?.name || t('account.noNameSet')
    const dropdownFooterLinks = useMemo(() => {
        if (!isLocal) return undefined
        const BASE_URL = `https://${getBaseDomain()}`
        return [
            { label: t('footer.website'), href: BASE_URL, external: true },
            ...getLegalLinks().map((link) => ({
                ...link,
                href: link.href.startsWith('mailto:')
                    ? link.href
                    : `${BASE_URL}${link.href}`,
                external: true
            }))
        ]
    }, [isLocal])

    const { data: sshKeys, isLoading, isError, refetch } = useSSHKeys()
    const { data: userStats, isLoading: isStatsLoading } = useUserStats()
    const skeletonCount = userStats?.sshKeyCount ?? 0
    const knowsCount = !isStatsLoading && userStats !== undefined

    const [howItWorksOpen, setHowItWorksOpen] = useState(false)

    return (
        <div
            className={`bg-background text-foreground ${isLocal ? 'fixed inset-0 flex flex-col overflow-hidden' : 'relative flex min-h-screen flex-col'}`}
        >
            {isLocal && (
                <div className='playground-grid pointer-events-none fixed inset-0 opacity-50' />
            )}
            {isLocal && (
                <div className='playground-gradient pointer-events-none fixed inset-0 opacity-30' />
            )}
            <PageTitle
                title={t('sshKeys.title')}
                description={t('sshKeys.description')}
                noIndex
            />
            {!isLocal && <PageBackground />}
            {isLocal ? (
                <div className='border-border bg-background relative z-10 flex items-center justify-between border-b px-6 py-3'>
                    <Logo to={ROUTES.CLAWS} />
                    <div className='flex items-center gap-1.5 sm:gap-3'>
                        <LanguageSelector />
                        <ThemeToggle />
                        <UserDropdown
                            displayName={localDisplayName}
                            onSignOut={async () => {}}
                            hideBilling
                            hideSignOut
                            footerLinks={dropdownFooterLinks}
                            openLinksWindowed={openLinksWindowed}
                            appVersion={appVersion || undefined}
                        />
                    </div>
                </div>
            ) : (
                <Header />
            )}

            <motion.main
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className={`relative mx-auto w-full max-w-6xl flex-1 px-6 pb-16 pt-8 ${isLocal ? 'overflow-y-auto' : ''}`}
            >
                <PageHeader
                    title={t('sshKeys.title')}
                    description={`${sshKeys?.length ?? 0} ${sshKeys?.length === 1 ? t('sshKeys.key') : t('sshKeys.keys')}`}
                    action={
                        sshKeys && sshKeys.length > 0 ? (
                            <ActionButton
                                onClick={() => setShowCreate(true)}
                                icon={
                                    <PlusCircleIcon
                                        className='h-5 w-5'
                                        weight='bold'
                                    />
                                }
                                label={t('sshKeys.addSshKey')}
                            />
                        ) : undefined
                    }
                />

                <div className='border-border bg-foreground/5 rounded-xl border p-8 backdrop-blur-sm'>
                    <div className='border-border bg-foreground/5 mb-6 rounded-lg border'>
                        <button
                            type='button'
                            onClick={() => setHowItWorksOpen(!howItWorksOpen)}
                            className='flex w-full items-center justify-between p-4 text-left'
                        >
                            <h3 className='font-semibold'>
                                {t('sshKeys.howSshKeysWork')}
                            </h3>
                            <CaretDownIcon
                                className={`text-muted-foreground h-4 w-4 transition-transform ${howItWorksOpen ? 'rotate-180' : ''}`}
                                weight='bold'
                            />
                        </button>
                        {howItWorksOpen && (
                            <ol className='text-muted-foreground list-inside list-decimal space-y-1 px-4 pb-4 text-sm'>
                                <li>{t('sshKeys.step1')}</li>
                                <li>
                                    {t('sshKeys.step2').split('public key')[0]}
                                    <strong className='text-foreground'>
                                        public key
                                    </strong>
                                    {t('sshKeys.step2').split(
                                        'public key'
                                    )[1] || ' here.'}
                                </li>
                                <li>{t('sshKeys.step3')}</li>
                                <li>
                                    {t('sshKeys.step4')}{' '}
                                    <code className='bg-foreground/10 rounded px-1'>
                                        {t('sshKeys.step4Command')}
                                    </code>{' '}
                                    {t('sshKeys.step4Suffix')}
                                </li>
                            </ol>
                        )}
                    </div>

                    {isError ? (
                        <ErrorState
                            title={t('errors.failedToLoadSSHKeys')}
                            description={t(
                                'errors.failedToLoadSSHKeysDescription'
                            )}
                            onRetry={() => refetch()}
                        />
                    ) : isLoading && knowsCount && skeletonCount === 0 ? (
                        <EmptyState
                            icon={
                                <KeyIcon className='text-primary h-10 w-10' />
                            }
                            title={t('sshKeys.noSshKeysYet')}
                            description={t('sshKeys.noSshKeysDescription')}
                            actionLabel={t('sshKeys.addSshKey')}
                            actionIcon={
                                <PlusCircleIcon
                                    className='h-5 w-5'
                                    weight='bold'
                                />
                            }
                            onAction={() => setShowCreate(true)}
                        />
                    ) : isLoading && skeletonCount > 0 ? (
                        <div className='space-y-1.5'>
                            {Array.from({ length: skeletonCount }).map(
                                (_, i) => (
                                    <SSHKeySkeleton key={i} />
                                )
                            )}
                        </div>
                    ) : sshKeys?.length === 0 ? (
                        <EmptyState
                            icon={
                                <KeyIcon className='text-primary h-10 w-10' />
                            }
                            title={t('sshKeys.noSshKeysYet')}
                            description={t('sshKeys.noSshKeysDescription')}
                            actionLabel={t('sshKeys.addSshKey')}
                            actionIcon={
                                <PlusCircleIcon
                                    className='h-5 w-5'
                                    weight='bold'
                                />
                            }
                            onAction={() => setShowCreate(true)}
                        />
                    ) : (
                        <div className='space-y-1.5'>
                            {sshKeys?.map((key) => (
                                <SSHKeyCard key={key.id} sshKey={key} />
                            ))}
                        </div>
                    )}
                </div>

                {showCreate && (
                    <CreateSSHKeyModal onClose={() => setShowCreate(false)} />
                )}
            </motion.main>

            {!isLocal && <LandingFooter />}
        </div>
    )
}

export default SSHKeys