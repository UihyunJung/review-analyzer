import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/contents/naver-place-review.ts',
      formats: ['iife'],
      name: 'NaverReview',
      fileName: () => 'content-naver-place.js'
    },
    rollupOptions: {
      output: { inlineDynamicImports: true }
    }
  }
})
