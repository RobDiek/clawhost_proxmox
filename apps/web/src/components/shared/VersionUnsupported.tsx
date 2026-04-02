import type { FC, ReactNode } from 'react'
import type { VersionUnsupportedProps } from '@/ts/Interfaces'

import { useMemo } from 'react'
import { WarningIcon, ArrowRightIcon } from '@phosphor-icons/react'
import { SUPPORTED_VERSIONS } from '@openclaw/shared'
import { t } from '@openclaw/i18n'

const cleanVersion = (raw: string): string => {
    const match = raw.match(/(\d{4}\.\d{1,2}\.\d{1,2}(?:-\d+)?)/)
    return match ? match[1] : raw
}

const VersionUnsupported: FC<VersionUnsupportedProps> = ({
    version,
    feature,
    featureKey,
    onGoToVersions
}): ReactNode => {
    const supportedList = useMemo(
        () => SUPPORTED_VERSIONS[featureKey] || [],
        [featureKey]
    )

    const displayVersion = cleanVersion(version)

    return (
        <div className='mx-5 mt-4 flex items-start gap-2.5 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3.5 py-2.5'>
            <WarningIcon
                className='mt-0.5 h-4 w-4 shrink-0 text-yellow-500'
                weight='fill'
            />
            <div className='min-w-0 flex-1'>
                <p className='text-[11px] font-medium text-yellow-500'>
                    {t('playground.featureVersionUnsupported', {
                        feature,
                        version: displayVersion
                    })}
                </p>
                <p className='text-muted-foreground mt-0.5 text-[11px]'>
                    {t('playground.featureVersionUnsupportedDescription', {
                        feature
                    })}
                </p>
                {supportedList.length > 0 && (
                    <p className='text-muted-foreground mt-1 text-[11px]'>
                        {t('playground.featureVersionUnsupportedSupported')}{' '}
                        <span className='text-foreground/70 font-medium'>
                            {supportedList.join(', ')}
                        </span>{' '}
                        ({t('playground.featureVersionUnsupportedNewer')})
                    </p>
                )}
                {onGoToVersions && (
                    <button
                        type='button'
                        onClick={onGoToVersions}
                        className='mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-yellow-500 transition-colors hover:text-yellow-400'
                    >
                        {t('playground.featureVersionUnsupportedButton')}
                        <ArrowRightIcon className='h-3 w-3' />
                    </button>
                )}
            </div>
        </div>
    )
}

export default VersionUnsupported