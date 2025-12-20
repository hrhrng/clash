import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    schema: './lib/db/migrations.schema.ts',
    out: './drizzle',
    dialect: 'sqlite',
    dbCredentials: {
        url: 'local.db',
    },
});
