import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    // Generation is offline. Migration separately requires DATABASE_URL.
    url: process.env.DATABASE_URL ?? 'postgresql://localhost/familyapp'
  },
  strict: true,
  verbose: true
});
