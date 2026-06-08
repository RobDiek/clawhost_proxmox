const childProcess = require('child_process')
const fs = require('fs')
const path = require('path')

const appDir = path.resolve(__dirname, '..')
const repoRoot = path.resolve(appDir, '../..')
const forgeBin = path.join(
    repoRoot,
    'node_modules',
    '@electron-forge',
    'cli',
    'dist',
    'electron-forge.js'
)
const tempLockPath = path.join(repoRoot, 'package-lock.json')
const fallbackUserAgent = 'npm/10.0.0 node/v22.0.0 linux x64'
const currentUserAgent = process.env.npm_config_user_agent || ''
const createdTempLock = !fs.existsSync(tempLockPath)

let child = null
let cleanedUp = false

const cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true

    if (createdTempLock && fs.existsSync(tempLockPath)) {
        fs.rmSync(tempLockPath, { force: true })
    }
}

if (createdTempLock) {
    fs.writeFileSync(
        tempLockPath,
        `${JSON.stringify(
            {
                name: 'clawnode',
                lockfileVersion: 3,
                packages: {}
            },
            null,
            4
        )}\n`
    )
}

child = childProcess.spawn(
    process.execPath,
    [forgeBin, ...process.argv.slice(2)],
    {
        cwd: appDir,
        stdio: 'inherit',
        env: {
            ...process.env,
            npm_config_user_agent:
                !currentUserAgent || currentUserAgent.startsWith('bun/')
                    ? fallbackUserAgent
                    : currentUserAgent
        }
    }
)

child.on('error', (error) => {
    cleanup()
    console.error(error)
    process.exit(1)
})

child.on('exit', (code, signal) => {
    cleanup()

    if (signal) {
        process.kill(process.pid, signal)
        return
    }

    process.exit(code ?? 1)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
        cleanup()

        if (child && !child.killed) {
            child.kill(signal)
        }
    })
}
