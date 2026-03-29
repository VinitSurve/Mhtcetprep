import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png'],
      manifest: {
        name: 'CETRanker – MAH MCA CET Practice',
        short_name: 'CETRanker',
        description: 'Adaptive learning and rank improvement system for MAH MCA CET',
        theme_color: '#0f1117',
        background_color: '#0f1117',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'logo.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/questions.*(formula|concept|topic).*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'formula-mode-cache',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 6 }
            }
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/attempts.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'revision-signals-cache',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 30 }
            }
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5623
  }
});
