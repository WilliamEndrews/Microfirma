import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Os pacotes do monorepo sao consumidos direto do CODIGO-FONTE (nao de dist).
 * Motivo: em Fase 0 queremos ciclo de feedback instantaneo, sem etapa de build
 * intermediaria. Os aliases abaixo garantem que o Vite transpile esse TS.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@microfirma/contracts': resolve(__dirname, '../../packages/contracts/src/index.ts'),
      '@microfirma/world-engine': resolve(__dirname, '../../packages/world-engine/src/index.ts'),
      '@microfirma/synthetic': resolve(__dirname, '../../packages/synthetic/src/index.ts'),
    },
  },
  server: { port: 5173, open: false },
});
