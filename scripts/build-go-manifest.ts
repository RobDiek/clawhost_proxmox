import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const root = resolve(import.meta.dirname, '..')
const desktopPkgPath = resolve(root, 'apps/clawhostgo/package.json')
const manifestPath = resolve(root, 'apps/web/public/go.json')

const pkg = JSON.parse(readFileSync(desktopPkgPath, 'utf-8'))
const version: string = pkg.version

const CDN_BASE = 'https://cdn.clawhost.cloud/go'

const manifest = {
    version,
    mac: {
        arm64: `${CDN_BASE}/clawhost-mac-arm64.zip`,
        x64: `${CDN_BASE}/clawhost-mac-intel.zip`
    },
    windows: `${CDN_BASE}/clawhost-windows.exe`
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 4))
console.log(`wrote go.json for v${version}`)