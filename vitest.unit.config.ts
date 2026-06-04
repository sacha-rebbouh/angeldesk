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
    // Live Coaching est ARCHIVÉ en prod (flag off) mais ses routes sont testées dans leur mode
    // ACTIVÉ (on vérifie la logique métier, pas le guard d'archivage). Le comportement archivé
    // (403 / webhook no-op) sera couvert par des tests dédiés qui forcent le flag à "false"
    // (vi.stubEnv). Refonte 5-sujets, Phase 3.
    env: { LIVE_COACHING_ENABLED: 'true' },
  },
});
