import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const projects = sqliteTable('project', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    description: text('description'),
    nodes: text('nodes', { mode: 'json' }).default('[]'),
    edges: text('edges', { mode: 'json' }).default('[]'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

export const messages = sqliteTable('message', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    content: text('content').notNull(),
    role: text('role').notNull(), // "user" or "assistant"
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

export const assets = sqliteTable('asset', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(), // User-defined unique name within project
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(), // R2 object key (e.g., "projects/{projectId}/assets/{uuid}.png")
    url: text('url').notNull(), // Public R2 URL
    type: text('type').notNull(), // "image" | "video" | "audio" | "text"
    status: text('status').default('completed'), // "pending" | "processing" | "completed" | "failed"
    taskId: text('task_id'), // External task ID (e.g., Kling task ID)
    metadata: text('metadata', { mode: 'json' }), // Additional info (dimensions, duration, etc.)
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (asset) => ({
    // Unique constraint: name must be unique within a project
    uniqueNamePerProject: {
        columns: [asset.projectId, asset.name],
        name: 'asset_project_name_unique',
    },
}));

// Auth.js Tables (Adapted for SQLite)
export const users = sqliteTable('user', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text('name'),
    email: text('email').unique(),
    emailVerified: integer('emailVerified', { mode: 'timestamp_ms' }),
    image: text('image'),
});

export const accounts = sqliteTable('account', {
    userId: text('userId')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
}, (account) => ({
    compoundKey: {
        columns: [account.provider, account.providerAccountId],
        name: 'account_provider_providerAccountId_pk',
    },
}));

export const sessions = sqliteTable('session', {
    sessionToken: text('sessionToken').primaryKey(),
    userId: text('userId')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
});

export const verificationTokens = sqliteTable(
    'verificationToken',
    {
        identifier: text('identifier').notNull(),
        token: text('token').notNull(),
        expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
    },
    (vt) => ({
        compoundKey: {
            columns: [vt.identifier, vt.token],
            name: 'verificationToken_identifier_token_pk',
        },
    })
);

import { relations } from 'drizzle-orm';

export const projectsRelations = relations(projects, ({ many }) => ({
    messages: many(messages),
    assets: many(assets),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
    project: one(projects, {
        fields: [messages.projectId],
        references: [projects.id],
    }),
}));

export const assetsRelations = relations(assets, ({ one }) => ({
    project: one(projects, {
        fields: [assets.projectId],
        references: [projects.id],
    }),
}));
