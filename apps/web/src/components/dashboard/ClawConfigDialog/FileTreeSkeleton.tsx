import type { FC, ReactNode } from 'react'

import { Skeleton } from '@/components/ui'

const FileTreeSkeleton: FC = (): ReactNode => {
    return (
        <div className='p-3'>
            <div className='flex items-center gap-1.5 py-1.5'>
                <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                <Skeleton className='h-3 w-16 rounded' />
            </div>
            <div className='ml-[19px]'>
                <div className="before:bg-muted-foreground/20 after:bg-muted-foreground/20 relative py-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:content-[''] after:absolute after:left-0 after:top-1/2 after:h-px after:w-3 after:-translate-y-px after:content-['']">
                    <div className='flex items-center gap-1.5'>
                        <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                        <Skeleton className='h-3 w-24 rounded' />
                    </div>
                </div>
                <div className='border-muted-foreground/20 border-l'>
                    <div className='ml-[19px]'>
                        <div className="before:bg-muted-foreground/20 after:bg-muted-foreground/20 relative py-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:content-[''] after:absolute after:left-0 after:top-1/2 after:h-px after:w-3 after:-translate-y-px after:content-['']">
                            <div className='flex items-center gap-1.5'>
                                <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                                <Skeleton className='h-3 w-16 rounded' />
                            </div>
                        </div>
                        <div className="before:bg-muted-foreground/20 after:bg-muted-foreground/20 relative py-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:content-[''] after:absolute after:left-0 after:top-1/2 after:h-px after:w-3 after:-translate-y-px after:content-['']">
                            <div className='flex items-center gap-1.5'>
                                <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                                <Skeleton className='h-3 w-20 rounded' />
                            </div>
                        </div>
                        <div className="before:bg-muted-foreground/20 after:bg-muted-foreground/20 relative py-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:content-[''] after:absolute after:left-0 after:top-1/2 after:h-px after:w-3 after:-translate-y-px after:content-['']">
                            <div className='flex items-center gap-1.5'>
                                <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                                <Skeleton className='h-3 w-14 rounded' />
                            </div>
                        </div>
                        <div className="before:border-muted-foreground/20 relative py-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-1/2 before:w-3 before:border-b before:border-l before:content-['']">
                            <div className='flex items-center gap-1.5'>
                                <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                                <Skeleton className='h-3 w-24 rounded' />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="before:bg-muted-foreground/20 after:bg-muted-foreground/20 relative py-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:content-[''] after:absolute after:left-0 after:top-1/2 after:h-px after:w-3 after:-translate-y-px after:content-['']">
                    <div className='flex items-center gap-1.5'>
                        <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                        <Skeleton className='h-3 w-14 rounded' />
                    </div>
                </div>
                <div className='border-muted-foreground/20 border-l'>
                    <div className='ml-[19px]'>
                        <div className="before:bg-muted-foreground/20 after:bg-muted-foreground/20 relative py-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:content-[''] after:absolute after:left-0 after:top-1/2 after:h-px after:w-3 after:-translate-y-px after:content-['']">
                            <div className='flex items-center gap-1.5'>
                                <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                                <Skeleton className='h-3 w-16 rounded' />
                            </div>
                        </div>
                        <div className="before:bg-muted-foreground/20 after:bg-muted-foreground/20 relative py-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:content-[''] after:absolute after:left-0 after:top-1/2 after:h-px after:w-3 after:-translate-y-px after:content-['']">
                            <div className='flex items-center gap-1.5'>
                                <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                                <Skeleton className='h-3 w-20 rounded' />
                            </div>
                        </div>
                        <div className="before:border-muted-foreground/20 relative py-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-1/2 before:w-3 before:border-b before:border-l before:content-['']">
                            <div className='flex items-center gap-1.5'>
                                <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                                <Skeleton className='h-3 w-12 rounded' />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="before:bg-muted-foreground/20 after:bg-muted-foreground/20 relative py-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:content-[''] after:absolute after:left-0 after:top-1/2 after:h-px after:w-3 after:-translate-y-px after:content-['']">
                    <div className='flex items-center gap-1.5'>
                        <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                        <Skeleton className='h-3 w-20 rounded' />
                    </div>
                </div>
                <div className="before:bg-muted-foreground/20 after:bg-muted-foreground/20 relative py-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:content-[''] after:absolute after:left-0 after:top-1/2 after:h-px after:w-3 after:-translate-y-px after:content-['']">
                    <div className='flex items-center gap-1.5'>
                        <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                        <Skeleton className='h-3 w-16 rounded' />
                    </div>
                </div>
                <div className="before:border-muted-foreground/20 relative py-1.5 pl-5 before:absolute before:left-0 before:top-0 before:h-1/2 before:w-3 before:border-b before:border-l before:content-['']">
                    <div className='flex items-center gap-1.5'>
                        <Skeleton className='h-3.5 w-3.5 shrink-0 rounded' />
                        <Skeleton className='h-3 w-24 rounded' />
                    </div>
                </div>
            </div>
        </div>
    )
}

export default FileTreeSkeleton