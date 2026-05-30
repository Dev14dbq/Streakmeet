import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { SWRConfig, mutate } from 'swr'
import { Capacitor } from '@capacitor/core'
import './i18n'
import { initTheme } from './lib/theme'
import './index.css'

initTheme()

// Set platform class on <html> before React mounts so CSS variables resolve immediately
if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add(`native-${Capacitor.getPlatform()}`)
}

// Native pull-to-refresh (iOS UIRefreshControl dispatches this event)
window.addEventListener('app-pull-to-refresh', () => {
  void mutate(() => true, undefined, { revalidate: true })
})

import App from './App.tsx'
import { fetcher } from './lib/api'
import { AuthProvider } from './context/AuthContext'

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
