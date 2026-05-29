import type { ForgeConfig } from '@electron-forge/shared-types'

import path from 'path'
import fs from 'fs'
import { MakerZIP } from '@electron-forge/maker-zip'
import { MakerDeb } from '@electron-forge/maker-deb'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { VitePlugin } from '@electron-forge/plugin-vite'

const copyNodePty = (
    buildPath: string,
    _electronVersion: string,
    _platform: string,
    _arch: string,
    callback: (err?: Error) => void
) => {
    const rootNodeModules = path.resolve(__dirname, '../../node_modules')
    const src = path.join(rootNodeModules, 'node-pty')
    const dest = path.join(buildPath, 'node_modules', 'node-pty')

    if (!fs.existsSync(src)) {
        callback(new Error('node-pty not found in root node_modules'))
        return
    }

    fs.cpSync(src, dest, { recursive: true })
    callback()
}

const {
    APPLE_SIGNING_IDENTITY,
    APPLE_ID,
    APPLE_ID_PASSWORD,
    APPLE_TEAM_ID
} = process.env

const shouldSign = Boolean(
    APPLE_SIGNING_IDENTITY && APPLE_ID && APPLE_ID_PASSWORD && APPLE_TEAM_ID
)

const config: ForgeConfig = {
    packagerConfig: {
        asar: {
            unpack: '**/node_modules/node-pty/**'
        },
        name: 'ClawHostGo',
        icon: './resources/icon',
        extraResource: ['./resources/node'],
        afterCopy: [copyNodePty],
        ...(shouldSign
            ? {
                  osxSign: {
                      identity: APPLE_SIGNING_IDENTITY,
                      optionsForFile: () => ({
                          entitlements: './resources/entitlements.mac.plist',
                          hardenedRuntime: true,
                          'gatekeeper-assess': false
                      })
                  },
                  osxNotarize: {
                      appleId: APPLE_ID as string,
                      appleIdPassword: APPLE_ID_PASSWORD as string,
                      teamId: APPLE_TEAM_ID as string
                  }
              }
            : {})
    },
    makers: [
        new MakerZIP({}, ['darwin']),
        new MakerSquirrel({ name: 'ClawHostGo' }),
        new MakerDeb({})
    ],
    plugins: [
        new VitePlugin({
            build: [
                {
                    entry: 'src/main.ts',
                    config: 'vite.main.config.ts'
                },
                {
                    entry: 'src/preload.ts',
                    config: 'vite.preload.config.ts'
                }
            ],
            renderer: [
                {
                    name: 'main_window',
                    config: 'vite.renderer.config.ts'
                }
            ]
        })
    ]
}

export default config