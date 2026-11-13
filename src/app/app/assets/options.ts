import { asc } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { assetCategories, orgUnits, vendors } from "@/db/schema";

export async function assetFormOptions(tx: Tx) {
  return {
    cats: (await tx.select().from(assetCategories).orderBy(asc(assetCategories.name))).map((c) => ({ id: c.id, label: `${c.name} (${c.code})` })),
    vendors: (await tx.select().from(vendors).orderBy(asc(vendors.name))).map((v) => ({ id: v.id, label: v.name })),
    units: (await tx.select().from(orgUnits).orderBy(asc(orgUnits.name))).map((u) => ({ id: u.id, label: u.name })),
  };
}
