import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            if (err.code === 'ECONNABORTED' || err.message.includes('ECONNABORTED')) {
              // Harmless error when browser reloads page and drops WebSocket
              return;
            }
            console.log('proxy error', err);
          });
        }
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
