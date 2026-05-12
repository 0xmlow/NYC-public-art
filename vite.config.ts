import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
// `base` must match the GitHub Pages subpath so asset URLs resolve correctly.
export default defineConfig({
  base: '/NYC-public-art/',
  plugins: [react()],
  server: { port: 8765 },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
