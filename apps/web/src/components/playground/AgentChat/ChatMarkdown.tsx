import type { FC, ReactNode } from 'react'
import type { ChatMarkdownProps } from '@/ts/Interfaces'

import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'

const ChatMarkdown: FC<ChatMarkdownProps> = ({ content }): ReactNode => {
    return (
        <div className='prose prose-sm dark:prose-invert prose-p:my-1 prose-p:leading-relaxed prose-pre:my-2 prose-pre:overflow-x-auto prose-pre:bg-foreground/10 prose-pre:p-3 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:mb-2 prose-headings:mt-3 prose-a:text-[#ef5350] prose-a:no-underline hover:prose-a:underline prose-code:rounded prose-code:bg-foreground/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none prose-pre:rounded-lg prose-img:my-2 prose-img:rounded-lg prose-hr:border-border prose-blockquote:border-border prose-blockquote:text-muted-foreground prose-strong:text-foreground prose-th:text-foreground/80 prose-td:text-muted-foreground min-w-0 max-w-none break-words'>
            <Markdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSanitize]}
            >
                {content}
            </Markdown>
        </div>
    )
}

export default ChatMarkdown