import { defineConfig } from 'vitest/config'
import path from 'path'

// Config Vitest du frontend — tests unitaires du client HTTP (refresh-on-401, dédup, déconnexion).
// Environnement `node` : ni DOM ni React nécessaires (fetch est mocké). L'alias `@` reprend celui
// de vite.config.ts. Les tests (fichiers .test.ts sous src) sont exclus du build applicatif.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
