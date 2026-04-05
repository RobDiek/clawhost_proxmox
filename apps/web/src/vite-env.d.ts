/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
    readonly VITE_FIREBASE_API_KEY: string
    readonly VITE_FIREBASE_PROJECT_ID: string
    readonly VITE_FIREBASE_STORAGE_BUCKET: string
    readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
    readonly VITE_FIREBASE_APP_ID: string
    readonly VITE_API_URL: string
    readonly VITE_GOOGLE_OAUTH_CLIENT_ID: string
    readonly VITE_GITHUB_OAUTH_CLIENT_ID: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}