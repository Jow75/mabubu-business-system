import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The build stamps the app's own version (vite.config.ts); tests get a fixed one.
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
    __BUILD_TIME__: JSON.stringify('2026-10-26T00:00:00.000Z'),
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
