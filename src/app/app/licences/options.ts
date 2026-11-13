import { asc, notInArray } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { employees, orgUnits, vendors } from "@/db/schema";

export async function subscriptionOptions(tx: Tx) {
  return {
    vendors: (await tx.select().from(vendors).orderBy(asc(vendors.name))).map((v) => ({ id: v.id, label: v.name })),
    units: (await tx.select().from(orgUnits).orderBy(asc(orgUnits.name))).map((u) => ({ id: u.id, label: u.name })),
    people: (await tx.select().from(employees).where(notInArray(employees.status, ["resigned", "terminated"])).orderBy(employees.firstName)).map((p) => ({ id: p.id, label: `${p.firstName} ${p.lastName}` })),
  };
}
