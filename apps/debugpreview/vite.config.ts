import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const publicDir = resolve(__dirname, '../../assets-source');

export default defineConfig({
  plugins: [react()],
  publicDir,
  resolve: {
    alias: {
      '@microfirma/contracts': resolve(__dirname, '../../packages/contracts/src/index.ts'),
      '@microfirma/world-engine': resolve(__dirname, '../../packages/world-engine/src/index.ts'),
    },
  },
  server: { port: 5175, open: false },
});
