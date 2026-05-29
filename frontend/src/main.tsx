import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { SWRConfig } from 'swr'
import './i18n'
import { initTheme } from './lib/theme'
import './index.css'

initTheme()
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
