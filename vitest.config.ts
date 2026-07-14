import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Utiliser Node.js comme environnement d'exécution
    environment: 'node',
    
    // Dossier contenant les tests
    include: ['src/**/*.test.ts'],
    
    // Couverture de code (désactivée temporairement - package @vitest/coverage-v8 manquant)
    coverage: {
      enabled: false,
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/**/__tests__/**'],
    },
    
    // Timeout pour les tests (par défaut: 5000ms)
    testTimeout: 10000,
    
    // Hooks de cycle de vie
    setupFiles: ['./src/infrastructure/test/setup.ts'],
  },
});
