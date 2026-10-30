import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Vite otherwise serves matching api/*.ts files as transformed source.
    // Proxy local Portal API calls to the deployed server functions so local
    // authenticated review follows the same authorization boundary.
    proxy: {
      '/api': {
        target: 'https://home-guard-dealer-portal.vercel.app',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
