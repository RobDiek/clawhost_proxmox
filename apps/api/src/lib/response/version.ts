import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { version } = require(join(process.cwd(), 'package.json'))

export default `v${version}`