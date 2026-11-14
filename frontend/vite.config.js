import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { devAdminPlugin } from './devAdminPlugin.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devAdminPlugin()],
})
