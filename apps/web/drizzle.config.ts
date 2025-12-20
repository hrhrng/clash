import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    schema: './lib/db/migrations.schema.ts',
    out: './drizzle',
    dialect: 'sqlite',
    driver: 'd1-http',
});
