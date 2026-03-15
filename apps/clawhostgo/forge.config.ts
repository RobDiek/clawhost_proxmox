import type { ForgeConfig } from '@electron-forge/shared-types'

import { MakerDMG } from '@electron-forge/maker-dmg'
import { MakerZIP } from '@electron-forge/maker-zip'
import { MakerDeb } from '@electron-forge/maker-deb'
import { VitePlugin } from '@electron-forge/plugin-vite'

const config: ForgeConfig = {
    packagerConfig: {
        asar: {
            unpack: '**/node_modules/node-pty/**'
        },
        name: 'ClawHostGo',
        icon: './resources/icon',
        extraResource: ['./resources/node']
    },
    makers: [new MakerDMG({}), new MakerZIP({}, ['darwin']), new MakerDeb({})],
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