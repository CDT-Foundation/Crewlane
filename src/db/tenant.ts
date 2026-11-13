import { sql } from "drizzle-orm";
import { getDb, type Db, type Tx } from "./client";

export type TenantScope = {
  tenantId: string;
  userId?: string | null;
};

/**
 * Runs `fn` in a transaction with the tenant context set. Every tenant table
 * has a row-level security policy keyed on `app.tenant_id`, so queries inside
 * `fn` can only see and write rows of this tenant, even if a WHERE clause is
 * forgotten. The setting is transaction-local and disappears on commit.
 */
export async function withTenant<T>(
  scope: TenantScope,
  fn: (tx: Tx) => Promise<T>,
  db: Db = getDb(),
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.tenant_id', ${scope.tenantId}, true),
                 set_config('app.user_id', ${scope.userId ?? ""}, true)`,
    );
    return fn(tx);
  });
}
