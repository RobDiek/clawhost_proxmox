import path from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src')
        }
    },
    build: {
        rollupOptions: {
            external: [
                'electron',
                'child_process',
                'fs',
                'path',
                'os',
                'crypto',
                'net',
                'http',
                'https',
                'url',
                'util',
                'events',
                'stream',
                'buffer',
                'node-pty'
            ]
        }
    }
})