import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    globals: true
  },
  resolve: {
    alias: {
      '~lib': resolve(__dirname, 'src/lib'),
      '~': resolve(__dirname, 'src')
    }
  }
})
