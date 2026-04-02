import type { FC, ReactNode } from 'react'
import type { SelfHostButtonProps } from '@/ts/Interfaces'

import { Button } from '@/components/ui'
import { useGitHubStars, GITHUB_REPO_URL } from '@/hooks'
import { GithubLogoIcon } from '@phosphor-icons/react'

const SelfHostButton: FC<SelfHostButtonProps> = ({
    label,
    showStars = true,
    large,
    className
}): ReactNode => {
    const { data: gitHubStars } = useGitHubStars()

    return (
        <Button
            size='lg'
            variant='outline'
            className={`border-border bg-foreground/5 text-foreground hover:bg-foreground/10 gap-2 ${large ? 'px-8 py-6 text-lg' : 'px-6'} ${className || ''}`}
            asChild
        >
            <a href={GITHUB_REPO_URL} target='_blank' rel='noopener noreferrer'>
                <GithubLogoIcon className='h-5 w-5' weight='fill' />
                {label}

                {showStars && gitHubStars && (
                    <span className='bg-foreground/10 flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs'>
                        {gitHubStars.formatted}
                        <span className='text-[12px]'>★</span>
                    </span>
                )}
            </a>
        </Button>
    )
}

export default SelfHostButton