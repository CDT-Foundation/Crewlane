import { and, eq } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { assets } from "@/db/schema";
import { requirePage, tenantTx } from "@/lib/session";
import { createTicketAction } from "../actions";

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<{ asset?: string }> }) {
  const ctx = await requirePage();
  const { asset } = await searchParams;
  const mine = await tenantTx(ctx, (tx) =>
    tx
      .select({ id: assets.id, tag: assets.tag, name: assets.name })
      .from(assets)
      .where(ctx.can("helpdesk.agent") ? undefined : and(eq(assets.custodianEmployeeId, ctx.employeeId ?? ""))),
  );
  return (
    <>
      <PageHeader title="New ticket" />
      <Card>
        <ActionForm action={createTicketAction} submitLabel="Submit ticket">
          <Field label="Short title"><Input name="title" required placeholder="Laptop will not connect to Wi-Fi" /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Category">
              <Select name="category" defaultValue="hardware">
                {["hardware", "software", "access", "network", "email", "facilities", "other"].map((c) => <option key={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="How urgent?">
              <Select name="priority" defaultValue="p3">
                {ctx.can("helpdesk.agent") ? <option value="p1">P1: whole site or team is down</option> : null}
                <option value="p2">P2: I cannot work</option>
                <option value="p3">P3: work is slowed down</option>
                <option value="p4">P4: question or request</option>
              </Select>
            </Field>
            <Field label="Which equipment?">
              <Select name="assetId" defaultValue={asset ?? ""}>
                <option value="">Not about a specific item</option>
                {mine.map((a) => <option key={a.id} value={a.id}>{a.tag} {a.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="What is happening?"><Textarea name="description" rows={5} required /></Field>
        </ActionForm>
      </Card>
    </>
  );
}
