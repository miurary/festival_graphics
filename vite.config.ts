import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        // index.html is the Phase 1 vanilla harness; the React app is a second
        // entry so the scaffold stays live without sitting in front of Phase 1.
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        phase2: fileURLToPath(new URL('./phase2.html', import.meta.url)),
      },
    },
  },
})
