import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret-0123456789',
      PUBLIC_BASE_URL: 'http://localhost:8080',
      DATA_DIR: './data/test',
    },
  },
});
