import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
// Site is served from the root of publicnyc.art (custom domain),
// so `base` is '/'. The CNAME file in public/ tells GitHub Pages
// which domain to publish on.
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: { port: 8765 },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
