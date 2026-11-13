import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

// Readiness probe: can we reach Postgres?
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: "ready" });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
