import { sql } from "drizzle-orm"
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { users as betterAuthUsers } from "./better-auth.schema"

/**
 * Projects table - stores basic project metadata
 * Canvas data (nodes/edges) is managed by Loro Sync Server in Durable Objects
 */
export const projects = sqliteTable("project", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    ownerId: text("owner_id")
        .notNull()
        .references(() => betterAuthUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(strftime('%s', 'now'))`),
})
