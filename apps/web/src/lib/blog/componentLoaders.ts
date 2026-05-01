import type { MdxModuleLoaders } from '@/ts/Types'

const loaders = import.meta.glob(
    '../../../content/posts/*.mdx'
) as MdxModuleLoaders

export default loaders