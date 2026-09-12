import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../universal/src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
  },
});
