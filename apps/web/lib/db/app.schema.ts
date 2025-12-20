import { relations } from "drizzle-orm"
import { sql } from "drizzle-orm"
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { users as betterAuthUsers } from "./better-auth.schema"

export const projects = sqliteTable("project", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    ownerId: text("owner_id").references(() => betterAuthUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    nodes: text("nodes", { mode: "json" }).default("[]"),
    edges: text("edges", { mode: "json" }).default("[]"),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
})

export const messages = sqliteTable("message", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    content: text("content").notNull(),
    role: text("role").notNull(), // "user" or "assistant"
    projectId: text("project_id")
        .notNull()
        .references(() => projects.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
})

export const assets = sqliteTable(
    "asset",
    {
        id: text("id")
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        name: text("name").notNull(), // User-defined unique name within project
        projectId: text("project_id")
            .notNull()
            .references(() => projects.id, { onDelete: "cascade" }),
        storageKey: text("storage_key").notNull(), // R2 object key (e.g., "projects/{projectId}/assets/{uuid}.png")
        url: text("url").notNull(), // Public R2 URL
        type: text("type").notNull(), // "image" | "video" | "audio" | "text"
        status: text("status").default("completed"), // "pending" | "processing" | "completed" | "failed"
        taskId: text("task_id"), // External task ID (e.g., Kling task ID)
        metadata: text("metadata", { mode: "json" }), // Additional info (dimensions, duration, etc.)
        description: text("description"), // AI-generated description
        createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
    },
    (asset) => ({
        uniqueNamePerProject: uniqueIndex("asset_project_name_unique").on(asset.projectId, asset.name),
    })
)

export const projectsRelations = relations(projects, ({ many }) => ({
    messages: many(messages),
    assets: many(assets),
}))

export const messagesRelations = relations(messages, ({ one }) => ({
    project: one(projects, {
        fields: [messages.projectId],
        references: [projects.id],
    }),
}))

export const assetsRelations = relations(assets, ({ one }) => ({
    project: one(projects, {
        fields: [assets.projectId],
        references: [projects.id],
    }),
}))
