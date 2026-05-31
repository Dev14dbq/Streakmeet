import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'

/** Dev: proxy /api to Rust api-gateway (:8080). Set VITE_DEV_RUST_PROXY=false for Node (:3000). */
const devRustProxy = process.env.VITE_DEV_RUST_PROXY !== 'false'
const apiProxyTarget = devRustProxy ? 'http://127.0.0.1:8080' : 'http://127.0.0.1:3000'

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: true,
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        timeout: 180_000,
      },
      '/connect': {
        target: 'http://127.0.0.1:8081',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    basicSsl(), // Включает HTTPS для локальной разработки (обязательно для камеры на телефоне)
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api/, /^\/connect/, /^\/uploads/, /^\/health/],
      },
      manifest: {
        name: 'StreakMeet',
        short_name: 'StreakMeet',
        description: 'Meet friends in real life to keep your streak alive!',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        categories: ['social'],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
})
