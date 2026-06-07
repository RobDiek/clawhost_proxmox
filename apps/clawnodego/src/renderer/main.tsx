import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import App from '@electron/App'
import '@/index.css'
import '@electron/electron.css'

document.documentElement.setAttribute('data-electron', 'true')

const queryClient = new QueryClient()
queryClient.clear()

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <App />
            </MemoryRouter>
        </QueryClientProvider>
    </React.StrictMode>
)