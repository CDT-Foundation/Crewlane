import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

type Pool = { sql: postgres.Sql; db: Db };

// Reuse pools across hot reloads in development.
const globalForDb = globalThis as unknown as { __crewlanePools?: Map<string, Pool> };
const pools = (globalForDb.__crewlanePools ??= new Map());

function makePool(url: string, max: number): Pool {
  const sql = postgres(url, {
    max,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {},
  });
  return { sql, db: drizzle(sql, { schema }) };
}

/**
 * Connection for the web app. It logs in as the `crewlane_app` role, which
 * does not own any table, so row-level security always applies.
 */
export function getDb(): Db {
  return getPool("DATABASE_URL").db;
}

export function getPool(envVar: "DATABASE_URL" | "WORKER_DATABASE_URL"): Pool {
  const url = process.env[envVar];
  if (!url) throw new Error(`${envVar} is not set`);
  let pool = pools.get(envVar);
  if (!pool) {
    pool = makePool(url, Number(process.env.DATABASE_POOL_MAX ?? 10));
    pools.set(envVar, pool);
  }
  return pool;
}

export async function closePools() {
  await Promise.all([...pools.values()].map((p) => p.sql.end({ timeout: 5 })));
  pools.clear();
}
