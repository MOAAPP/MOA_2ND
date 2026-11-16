import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: mode === 'single' ? { assetsInlineLimit: 100_000_000 } : {},
  server: {
    proxy: {
      '/api/v4': process.env.MOA_FASTAPI ?? 'http://127.0.0.1:8000',
      '/api': process.env.MOA_NODE ?? 'http://127.0.0.1:8787',
    },
  },
}))
