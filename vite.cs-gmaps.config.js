import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/contents/google-maps-review.ts',
      formats: ['iife'],
      name: 'GMapsReview',
      fileName: () => 'content-google-maps.js'
    },
    rollupOptions: {
      output: { inlineDynamicImports: true }
    }
  }
})
