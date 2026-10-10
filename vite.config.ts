import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ...(mode === 'android' ? [{
      name: 'exclude-hosted-apk-from-android',
      closeBundle() {
        rmSync(resolve('dist/updates/bars/apk'), { recursive: true, force: true })
      },
    }] : []),
  ],
}))
