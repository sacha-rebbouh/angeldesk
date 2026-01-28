import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// Configuration for unit tests only (no Storybook dependencies)
export default defineConfig({
  resolve: {
    alias: {
      '@': path.join(dirname, 'src'),
    },
  },
  test: {
    name: 'unit',
    include: ['src/**/__tests__/**/*.test.ts'],
    exclude: ['node_modules', '.storybook'],
    environment: 'node',
    globals: false,
  },
});
