import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  // Shown under Me so anyone can tell which build a device runs.
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['brand/favicon-32.png'],
      // Install icons are read by the browser itself; the app never needs them offline.
      includeManifestIcons: false,
      manifest: {
        // `id` and `scope` are what browsers already derived from start_url
        // '/', written out so the installed app keeps one identity (no second
        // install on phones that already have it).
        id: '/',
        // NAS Mabubu System (the owner's name for the app, 26 Oct 2026). The id
        // stays '/', so an installed app updates its name and icon in place.
        name: 'NAS Mabubu System',
        short_name: 'NAS Mabubu',
        description: 'NAS Mabubu System: stock, shipments, sales and cash for the Mabubu family business.',
        lang: 'en',
        categories: ['business', 'productivity'],
        theme_color: '#2e3a87',
        background_color: '#f7f3ec',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        // Opening Mabubu again brings the open window forward instead of a second copy.
        launch_handler: { client_mode: ['focus-existing', 'auto'] },
        // The owner's logo (scripts/make-brand-icons.py). New paths, so browsers
        // see the change and refresh the installed icon; the old files stay
        // in public/ for a release, for anything that still asks for them.
        icons: [
          { src: 'brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // A new version takes over at once instead of waiting until every tab
        // and installed window is closed (phones rarely close a tab). The page
        // then reloads safely: see src/client/lib/update.ts.
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // jsPDF's optional HTML/SVG helpers are never used by the app; don't make phones download them.
        // Font subsets for scripts the app's languages (en/fr/sw) never use: ~110 kB
        // phones would precache for nothing. The CSS still declares them, so a
        // browser fetches one online in the rare case a name needs it.
        globIgnores: [
          '**/pdf-optional-*.js',
          '**/*-{vietnamese,cyrillic,greek}-*.woff2',
          // Install icons are fetched by the browser itself, not by the app:
          // phones need not keep a second copy (about 0.5 MB) for offline use.
          'brand/icon-*.png',
          'brand/apple-touch-icon.png',
          'icon-*.png',
          'favicon.svg',
        ],
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
