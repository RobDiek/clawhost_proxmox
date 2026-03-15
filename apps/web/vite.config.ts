import { defineConfig, loadEnv } from 'vite'

import { readFileSync } from 'fs'
import path from 'path'
import react from '@vitejs/plugin-react'
import mdx from '@mdx-js/rollup'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import remarkGfm from 'remark-gfm'
import viteMdxSanitize from './src/plugins/vite-mdx-sanitize'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd())
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'))

    return {
        define: {
            __APP_VERSION__: JSON.stringify(`v${pkg.version}`)
        },
        plugins: [
            viteMdxSanitize(),
            mdx({
                remarkPlugins: [
                    remarkGfm,
                    remarkFrontmatter,
                    remarkMdxFrontmatter
                ]
            }),
            react()
        ],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src')
            },
            dedupe: [
                '@codemirror/state',
                '@codemirror/view',
                '@codemirror/language',
                '@lezer/common',
                '@lezer/highlight',
                '@lezer/lr',
                '@xterm/xterm'
            ]
        },
        build: {
            sourcemap: 'hidden',
            rollupOptions: {
                output: {
                    manualChunks: {
                        'framer-motion': ['framer-motion'],
                        'react-flow': ['@xyflow/react'],
                        codemirror: [
                            '@codemirror/state',
                            '@codemirror/view',
                            '@codemirror/language',
                            '@codemirror/lang-json'
                        ],
                        phosphor: ['@phosphor-icons/react'],
                        firebase: [
                            'firebase/app',
                            'firebase/auth'
                        ],
                        tanstack: [
                            '@tanstack/react-query',
                            '@tanstack/react-query-persist-client',
                            '@tanstack/query-sync-storage-persister'
                        ]
                    }
                }
            }
        },
        server: {
            port: Number(env.VITE_PORT) || 1111,
            proxy: {
                '/ws': {
                    target: `ws://localhost:${env.VITE_WS_PORT}`,
                    ws: true
                },
                '/api': {
                    target: `http://localhost:${env.VITE_API_PORT}`,
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/api/, '')
                }
            }
        }
    }
})