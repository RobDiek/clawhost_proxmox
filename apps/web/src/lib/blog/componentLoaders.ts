import type { ComponentType } from 'react'

const loaders = import.meta.glob('../../../content/posts/*.mdx') as Record<
    string,
    () => Promise<{ default: ComponentType }>
>

export default loaders