import { and, desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { employees, licenceAssignments, softwareSubscriptions, vendorInvoices } from "@/db/schema";
import { annualCost } from "@/lib/licences";
import { requirePage, tenantTx } from "@/lib/session";
import { money } from "@/lib/utils";
import { assignSeatAction, revokeSeatAction, saveSubscriptionAction, uploadInvoiceAction } from "../actions";
import { subscriptionOptions } from "../options";
import { SubscriptionFields } from "../sub-fields";

export default async function SubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requirePage("licences.manage");
  const data = await tenantTx(ctx, async (tx) => {
    const [s] = await tx.select().from(softwareSubscriptions).where(eq(softwareSubscriptions.id, id));
    if (!s) return null;
    const seats = await tx
      .select({ a: licenceAssignments, first: employees.firstName, last: employees.lastName, status: employees.status })
      .from(licenceAssignments)
      .innerJoin(employees, eq(employees.id, licenceAssignments.employeeId))
      .where(and(eq(licenceAssignments.subscriptionId, id), isNull(licenceAssignments.revokedAt)));
    const invoices = await tx.select().from(vendorInvoices).where(eq(vendorInvoices.subscriptionId, id)).orderBy(desc(vendorInvoices.issuedOn));
    return { s, seats, invoices, opts: await subscriptionOptions(tx) };
  });
  if (!data) notFound();
  const { s } = data;
  const holders = new Set(data.seats.map((x) => x.a.employeeId));

  return (
    <>
      <PageHeader title={s.product} description={`${data.seats.length} of ${s.seatsTotal} seats used · ${money(annualCost(s), s.currency)} a year · renews ${s.renewalDate}`} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Seats">
            <Table>
              <thead><tr><th>Person</th><th>Since</th><th /></tr></thead>
              <tbody>
                {data.seats.map(({ a, first, last, status }) => (
                  <tr key={a.id}>
                    <td>{first} {last} {status === "resigned" || status === "terminated" ? <span className="text-xs text-red-600">(left: reclaim this seat)</span> : null}</td>
                    <td className="text-xs text-slate-500">{a.assignedAt.toISOString().slice(0, 10)}</td>
                    <td><ActionForm action={revokeSeatAction.bind(null, s.id, a.id)} submitLabel="Reclaim" variant="ghost" inline /></td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="mt-4">
              <ActionForm action={assignSeatAction.bind(null, s.id)} submitLabel="Assign seat" variant="secondary" inline>
                <Select name="employeeId" className="w-64" required>
                  <option value="">Choose…</option>
                  {data.opts.people.filter((p) => !holders.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </Select>
              </ActionForm>
            </div>
          </Card>
          <Card title="Details">
            <ActionForm action={saveSubscriptionAction.bind(null, s.id)} submitLabel="Save">
              <SubscriptionFields s={s} {...data.opts} />
            </ActionForm>
          </Card>
        </div>
        <Card title="Invoice vault">
          <ul className="mb-4 space-y-2 text-sm">
            {data.invoices.map((i) => (
              <li key={i.id} className="flex justify-between gap-2">
                <span>
                  {i.fileKey ? <a className="text-brand hover:underline" href={`/api/files/${i.fileKey}`}>{i.invoiceNo}</a> : i.invoiceNo}
                  <span className="text-slate-500"> · {i.issuedOn}</span>
                </span>
                <span className="tabular-nums">{money(i.amount, i.currency)}</span>
              </li>
            ))}
          </ul>
          <ActionForm action={uploadInvoiceAction.bind(null, s.id)} submitLabel="Add invoice" variant="secondary" resetOnSuccess>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Invoice no."><Input name="invoiceNo" required /></Field>
              <Field label="Amount"><Input name="amount" inputMode="decimal" required /></Field>
              <Field label="Date"><Input name="issuedOn" type="date" required /></Field>
              <Field label="Due"><Input name="dueOn" type="date" /></Field>
            </div>
            <Field label="PDF or image"><Input name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" /></Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
