import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: '../../packages/data/src/schema.ts',
  out: './drizzle',
});
