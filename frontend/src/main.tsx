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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SWRConfig
        value={{
          fetcher,
          revalidateOnFocus: true,
          dedupingInterval: 5_000,
        }}
      >
        <App />
      </SWRConfig>
    </BrowserRouter>
  </StrictMode>
)
