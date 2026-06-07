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
        dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'],
        alias: {
            '@/lib/api': path.resolve(__dirname, './src/renderer/shims/api'),
            '@/': path.resolve(__dirname, '../web/src') + '/',
            '@electron/': path.resolve(__dirname, './src/renderer') + '/',
            react: path.resolve(__dirname, '../../node_modules/react'),
            'react-dom': path.resolve(
                __dirname,
                '../../node_modules/react-dom'
            ),
            'react-router': path.resolve(
                __dirname,
                '../../node_modules/react-router'
            ),
            'react-router-dom': path.resolve(
                __dirname,
                '../../node_modules/react-router-dom'
            ),
            '@tanstack/react-query': path.resolve(
                __dirname,
                '../../node_modules/@tanstack/react-query'
            )
        }
    }
})