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
}));

export const messagesRelations = relations(messages, ({ one }) => ({
    project: one(projects, {
        fields: [messages.projectId],
        references: [projects.id],
    }),
}));
