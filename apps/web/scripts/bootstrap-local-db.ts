import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const run = (command: string, args: string[]) => {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const dbPath = path.resolve(process.cwd(), "local.db");

if (fs.existsSync(dbPath)) {
  const db = new Database(dbPath);
  try {
    const hasMigrationsTable = Boolean(
      db
        .prepare(
          "select 1 from sqlite_master where type='table' and name='__drizzle_migrations' limit 1;",
        )
        .get(),
    );

    const migrationsCount = hasMigrationsTable
      ? Number(
          db.prepare("select count(*) as c from __drizzle_migrations;").get()
            ?.c ?? 0,
        )
      : 0;

    if (!hasMigrationsTable || migrationsCount === 0) {
      const backupPath = path.resolve(
        process.cwd(),
        `local.db.bak-${new Date().toISOString().replaceAll(":", "-")}`,
      );
      db.close();
      fs.renameSync(dbPath, backupPath);
      console.log(
        `[db] Detected incompatible local.db; moved to ${path.basename(backupPath)}`,
      );
    } else {
      db.close();
    }
  } catch (error) {
    db.close();
    throw error;
  }
}

run("pnpm", [
  "exec",
  "drizzle-kit",
  "migrate",
  "--config",
  "drizzle.local.config.ts",
]);
