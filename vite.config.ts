import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        // Polyfill Node.js 'buffer' module for browser builds (required by papaparse -> safe-buffer)
        buffer: 'buffer/',
      },
    },
    define: {
      // Make 'global' available — some CJS packages expect it
      global: 'globalThis',
    },
    optimizeDeps: {
      include: ['papaparse', 'buffer'],
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
