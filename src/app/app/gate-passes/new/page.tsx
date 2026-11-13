import { asc, eq, notInArray } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { assets, employees } from "@/db/schema";
import { requirePage, tenantTx } from "@/lib/session";
import { issuePassAction } from "../actions";

export default async function NewPassPage({ searchParams }: { searchParams: Promise<{ asset?: string }> }) {
  const ctx = await requirePage("gatepass.manage");
  const { asset } = await searchParams;
  const { assetRows, people, preset } = await tenantTx(ctx, async (tx) => {
    const assetRows = await tx.select({ id: assets.id, tag: assets.tag, name: assets.name }).from(assets).where(notInArray(assets.status, ["disposed", "lost"])).orderBy(asc(assets.tag));
    const people = await tx.select({ id: employees.id, first: employees.firstName, last: employees.lastName }).from(employees).where(notInArray(employees.status, ["resigned", "terminated"])).orderBy(employees.firstName);
    const [preset] = asset && /^[0-9a-f-]{36}$/.test(asset) ? await tx.select().from(assets).where(eq(assets.id, asset)) : [];
    return { assetRows, people, preset };
  });
  return (
    <>
      <PageHeader title="Issue gate pass" />
      <Card>
        <ActionForm action={issuePassAction} submitLabel="Issue pass">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type">
              <Select name="type" defaultValue="returnable">
                <option value="returnable">Returnable (comes back)</option>
                <option value="non_returnable">Non-returnable</option>
              </Select>
            </Field>
            <Field label="Asset (optional)">
              <Select name="assetId" defaultValue={preset?.id ?? ""}>
                <option value="">Not a registered asset</option>
                {assetRows.map((a) => <option key={a.id} value={a.id}>{a.tag} {a.name}</option>)}
              </Select>
            </Field>
            <Field label="What is leaving" className="sm:col-span-2"><Textarea name="description" rows={2} defaultValue={preset ? `${preset.tag} ${preset.name}${preset.serialNo ? `, S/N ${preset.serialNo}` : ""}` : ""} required /></Field>
            <Field label="Carried by"><Input name="carrierName" required /></Field>
            <Field label="Carrier is an employee">
              <Select name="carrierEmployeeId" defaultValue="">
                <option value="">No (courier / vendor)</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.first} {p.last}</option>)}
              </Select>
            </Field>
            <Field label="Destination"><Input name="destination" required /></Field>
            <Field label="Expected back on" hint="Required for returnable passes."><Input name="expectedReturnOn" type="date" /></Field>
            <Field label="Reason" className="sm:col-span-2"><Input name="reason" placeholder="Repair under warranty" /></Field>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
