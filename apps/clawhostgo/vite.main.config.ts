import path from 'path'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, __dirname, '')

    return {
        define: {
            'process.env.GITHUB_CLIENT_ID': JSON.stringify(
                env.GITHUB_CLIENT_ID || ''
            ),
            'process.env.GITHUB_CLIENT_SECRET': JSON.stringify(
                env.GITHUB_CLIENT_SECRET || ''
            )
        },
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
    }
})