/**
 * Applies SQL migrations as the schema owner, then (optionally) enables login
 * for the runtime roles. Bundled to dist/migrate.mjs for the container image
 * and run as a Helm pre-install/pre-upgrade Job.
 *
 *   DATABASE_ADMIN_URL   owner connection (required)
 *   APP_DB_PASSWORD      sets LOGIN + password on role crewlane_app
 *   WORKER_DB_PASSWORD   sets LOGIN + password on role crewlane_worker
 *   MIGRATIONS_DIR       defaults to ./drizzle
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";
import { upgradeAllTenants } from "@/lib/seed";

async function main() {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new Error("DATABASE_ADMIN_URL is not set");

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const folder = process.env.MIGRATIONS_DIR ?? "drizzle";
    await migrate(drizzle(sql), { migrationsFolder: folder });
    console.log(JSON.stringify({ level: "info", msg: "migrations applied", folder }));
    const upgraded = await upgradeAllTenants(drizzle(sql, { schema }));
    console.log(JSON.stringify({ level: "info", msg: "tenant defaults synced", tenants: upgraded }));

    const logins: Array<[string, string | undefined]> = [
      ["crewlane_app", process.env.APP_DB_PASSWORD],
      ["crewlane_worker", process.env.WORKER_DB_PASSWORD],
    ];
    for (const [role, password] of logins) {
      if (!password) continue;
      const [{ stmt }] = await sql<{ stmt: string }[]>`
        select format('ALTER ROLE %I WITH LOGIN PASSWORD %L', ${role}::text, ${password}::text) as stmt`;
      await sql.unsafe(stmt);
      console.log(JSON.stringify({ level: "info", msg: "role login enabled", role }));
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ level: "error", msg: "migration failed", error: String(err), cause: String((err as { cause?: unknown })?.cause ?? "") }));
  process.exit(1);
});
