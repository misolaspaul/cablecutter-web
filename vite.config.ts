import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// Relative base so the app works from a GitHub Pages project path (user.github.io/repo/)
export default defineConfig({
  base: './',
  plugins: [preact()],
  // hls.js (~500 kB) is already its own chunk, loaded only when a stream plays outside Safari
  build: { chunkSizeWarningLimit: 600 },
})
