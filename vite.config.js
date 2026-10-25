import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // API calls go to `wrangler pages dev` (Pages Functions + R2) during local dev
    proxy: {
      '/api': 'http://localhost:8788',
    },
  },
})
