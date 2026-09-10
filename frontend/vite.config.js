import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      },
      '/consultations': 'http://127.0.0.1:5000',
      '/health': 'http://127.0.0.1:5000',
      '/analyze': 'http://127.0.0.1:5000',
      '/analyze-file': 'http://127.0.0.1:5000',
      '/predict': 'http://127.0.0.1:5000'
    }
  }
})
