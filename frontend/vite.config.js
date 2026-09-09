import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/consultations': 'http://127.0.0.1:5000',
      '/health': 'http://127.0.0.1:5000',
      // Preserve the browser host for Flask's same-origin URL acquisition check.
      // Keep this before the broader /analyze prefix.
      '/analyze-url': { target: 'http://127.0.0.1:5000', changeOrigin: false },
      '/analyze': 'http://127.0.0.1:5000',
      '/analyze-file': 'http://127.0.0.1:5000',
      '/predict': 'http://127.0.0.1:5000'
    }
  }
})
