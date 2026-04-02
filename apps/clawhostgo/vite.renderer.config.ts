import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const keepAlive = () => ({
    name: 'keep-alive',
    configureServer() {
        process.stdin.removeAllListeners('end')
        process.stdin.resume()
    }
})

export default defineConfig({
    plugins: [keepAlive(), react()],
    optimizeDeps: {
        exclude: ['@openclaw/i18n', '@openclaw/shared']
    },
    server: {
        port: 3333,
        watch: {
            ignored: ['!**/packages/i18n/**', '!**/packages/shared/**']
        }
    },
    resolve: {
        alias: {
            '@/lib/api': path.resolve(__dirname, './src/renderer/shims/api'),
            '@/components/dashboard/CreateClawModal': path.resolve(
                __dirname,
                './src/renderer/components/CreateClawModal'
            ),
            '@/': path.resolve(__dirname, '../web/src') + '/',
            '@electron/': path.resolve(__dirname, './src/renderer') + '/',
            react: path.resolve(__dirname, '../../node_modules/react'),
            'react-dom': path.resolve(
                __dirname,
                '../../node_modules/react-dom'
            ),
            '@tanstack/react-query': path.resolve(
                __dirname,
                '../../node_modules/@tanstack/react-query'
            )
        }
    }
})