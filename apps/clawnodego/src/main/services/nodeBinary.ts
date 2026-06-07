import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { execSync } from 'child_process'

const NODE_VERSION = '22.16.0'
const MIN_NODE_MAJOR = 22

const getBundledNodeDir = (): string => {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'node')
    }
    return path.join(app.getAppPath(), '..', '..', 'resources', 'node')
}

const getBundledNodePath = (): string => {
    const binary = process.platform === 'win32' ? 'node.exe' : 'node'
    return path.join(getBundledNodeDir(), 'bin', binary)
}

const getBundledNpmPath = (): string => {
    const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    return path.join(getBundledNodeDir(), 'bin', npmBin)
}

const downloadNode = (): boolean => {
    const nodeDir = getBundledNodeDir()
    const nodePath = getBundledNodePath()

    if (fs.existsSync(nodePath)) return true

    const platformMap: Record<string, string> = {
        darwin: 'darwin',
        linux: 'linux',
        win32: 'win'
    }
    const archMap: Record<string, string> = {
        x64: 'x64',
        arm64: 'arm64'
    }

    const os = platformMap[process.platform]
    const arch = archMap[process.arch]
    if (!os || !arch) return false

    const tarball = `node-v${NODE_VERSION}-${os}-${arch}.tar.gz`
    const url = `https://nodejs.org/dist/v${NODE_VERSION}/${tarball}`

    try {
        const tmpDir = execSync('mktemp -d', { encoding: 'utf-8' }).trim()
        const tmpFile = path.join(tmpDir, tarball)

        execSync(`curl -fsSL "${url}" -o "${tmpFile}"`, { timeout: 120000 })
        execSync(`tar -xzf "${tmpFile}" -C "${tmpDir}"`, { timeout: 60000 })

        const extracted = path.join(
            tmpDir,
            `node-v${NODE_VERSION}-${os}-${arch}`
        )

        fs.mkdirSync(path.join(nodeDir, 'bin'), { recursive: true })
        fs.copyFileSync(
            path.join(extracted, 'bin', 'node'),
            path.join(nodeDir, 'bin', 'node')
        )
        fs.chmodSync(path.join(nodeDir, 'bin', 'node'), 0o755)

        const npmSrc = path.join(extracted, 'lib', 'node_modules', 'npm')
        const npmDst = path.join(nodeDir, 'bin', 'npm-pkg')
        execSync(`cp -r "${npmSrc}" "${npmDst}"`)

        const npmScript = `#!/bin/sh\nbasedir=$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")\nexec "$basedir/node" "$basedir/npm-pkg/bin/npm-cli.js" "$@"\n`
        fs.writeFileSync(path.join(nodeDir, 'bin', 'npm'), npmScript)
        fs.chmodSync(path.join(nodeDir, 'bin', 'npm'), 0o755)

        execSync(`rm -rf "${tmpDir}"`)
        return true
    } catch {
        return false
    }
}

const getNodeBinaryPath = (): string => {
    const bundled = getBundledNodePath()
    if (fs.existsSync(bundled)) return bundled

    if (downloadNode()) return bundled

    if (!app.isPackaged) {
        try {
            const systemNode = execSync('which node', {
                encoding: 'utf-8'
            }).trim()
            return systemNode
        } catch {
            return process.execPath
        }
    }

    return bundled
}

const getNpmPath = (): string => {
    const bundled = getBundledNpmPath()
    if (fs.existsSync(bundled)) return bundled

    const nodePath = getNodeBinaryPath()
    const nodeDir = path.dirname(nodePath)
    const npmCandidate = path.join(nodeDir, 'npm')
    if (fs.existsSync(npmCandidate)) return npmCandidate

    try {
        return execSync('which npm', { encoding: 'utf-8' }).trim()
    } catch {
        return 'npm'
    }
}

const ensureNode = (): boolean => {
    if (fs.existsSync(getBundledNodePath())) return true
    return downloadNode()
}

const nodeBinary = { getNodeBinaryPath, getNpmPath, ensureNode, MIN_NODE_MAJOR }

export default nodeBinary