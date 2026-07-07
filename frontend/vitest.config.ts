import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// Config Vitest du frontend. Deux familles de tests :
//  - `*.test.ts` (env `node`, défaut) : client HTTP (refresh-on-401…), helpers purs (filtres audit).
//  - `*.test.tsx` : composants React sous jsdom (ex. DatePicker), via le docblock
//    `// @vitest-environment jsdom` en tête de fichier. Le plugin React assure la transpilation JSX.
// L'alias `@` reprend celui de vite.config.ts. Les tests (`*.test.*` sous src) sont exclus du build.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
