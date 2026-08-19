import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 65,
        branches: 50,
        functions: 60,
        lines: 70,
      },
    },
  },
});
