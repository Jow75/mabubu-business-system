import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Mabubu — business records',
        short_name: 'Mabubu',
        description: 'Stock, shipments, sales and cash for the Mabubu family business.',
        theme_color: '#2e3a87',
        background_color: '#f7f3ec',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // jsPDF's optional HTML/SVG helpers are never used by the app; don't make phones download them.
        globIgnores: ['**/pdf-optional-*.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Rollup's shared CommonJS helpers must not land in an optional chunk:
          // the app imports them at start-up, and optional chunks are not cached
          // for offline use, so the app would not open without internet.
          if (id.includes('commonjsHelpers')) return 'cjs-helpers';
          const m = /node_modules\/(html2canvas|dompurify|canvg)\//.exec(id.replace(/\\/g, '/'));
          return m ? `pdf-optional-${m[1]}` : undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
});
