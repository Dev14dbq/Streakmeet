import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { SWRConfig } from 'swr'
import { Capacitor } from '@capacitor/core'
import './i18n'
import { hydrateAuthStorage } from './lib/authStorage'
import { initTheme } from './lib/theme'
import './index.css'

initTheme()

// Set platform class on <html> before React mounts so CSS variables resolve immediately
if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add(`native-${Capacitor.getPlatform()}`)
}

import App from './App.tsx'
import { fetcher } from './lib/api'
import { AuthProvider } from './context/AuthContext'

async function mountApp() {
  await hydrateAuthStorage()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <SWRConfig
            value={{
              fetcher,
              revalidateOnFocus: false,
              revalidateOnMount: false,
              dedupingInterval: 5_000,
              keepPreviousData: true,
            }}
          >
            <App />
          </SWRConfig>
        </AuthProvider>
      </BrowserRouter>
    </StrictMode>
  )
}

void mountApp()
