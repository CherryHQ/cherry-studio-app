import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/backend/infrastructure/db/schemas/index.ts',
  out: './migrations/sqlite-drizzle',
  dialect: 'sqlite',
  casing: 'snake_case',
});
