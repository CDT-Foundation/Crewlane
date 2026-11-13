/**
 * When TEST_DATABASE_ADMIN_URL is set (a superuser or a role with CREATEDB +
 * CREATEROLE), creates a fresh `crewlane_test` database, runs the real
 * migrations and points DATABASE_URL / WORKER_DATABASE_URL at it using the
 * runtime roles. Without it, integration tests are skipped.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { TestProject } from "vitest/node";

const DB = "crewlane_test";

export default async function setup(project: TestProject) {
  const admin = process.env.TEST_DATABASE_ADMIN_URL;
  if (!admin) return;

  const server = postgres(admin, { max: 1, onnotice: () => {} });
  await server.unsafe(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await server.unsafe(`CREATE DATABASE ${DB}`);
  await server.end();

  const url = new URL(admin);
  url.pathname = `/${DB}`;
  const owner = postgres(url.toString(), { max: 1, onnotice: () => {} });
  await migrate(drizzle(owner), { migrationsFolder: "drizzle" });
  await owner.unsafe(`ALTER ROLE crewlane_app WITH LOGIN PASSWORD 'test-app'`);
  await owner.unsafe(`ALTER ROLE crewlane_worker WITH LOGIN PASSWORD 'test-worker'`);
  await owner.end();

  const app = new URL(url);
  app.username = "crewlane_app";
  app.password = "test-app";
  const worker = new URL(url);
  worker.username = "crewlane_worker";
  worker.password = "test-worker";

  project.provide("databaseUrl", app.toString());
  project.provide("workerDatabaseUrl", worker.toString());
  project.provide("ownerDatabaseUrl", url.toString());
}

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl?: string;
    workerDatabaseUrl?: string;
    ownerDatabaseUrl?: string;
  }
}
