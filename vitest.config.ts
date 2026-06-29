import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// Configuración de tests aislada de los plugins de la app (Tailwind/React),
// para que las pruebas de lógica pura sean rápidas y deterministas.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
