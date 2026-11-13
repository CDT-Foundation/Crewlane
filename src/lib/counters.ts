import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";

/** Next document number for the current tenant, e.g. AST-00042. */
export async function nextNumber(tx: Tx, key: string, prefix: string, pad = 5): Promise<string> {
  const rows = await tx.execute<{ value: string }>(sql`select next_tenant_counter(${key}) as value`);
  return `${prefix}-${String(rows[0].value).padStart(pad, "0")}`;
}
