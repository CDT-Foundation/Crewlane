import { asc } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { Card, Input, PageHeader, Table } from "@/components/ui";
import { slaPolicies } from "@/db/schema";
import { requirePage, tenantTx } from "@/lib/session";
import { saveSlaAction } from "../actions";

export default async function SlaSettings() {
  const ctx = await requirePage("helpdesk.manage");
  const rows = await tenantTx(ctx, (tx) => tx.select().from(slaPolicies).orderBy(asc(slaPolicies.priority)));
  return (
    <>
      <PageHeader title="SLA targets" description="Hours to first response and to resolution, per priority. Breaches notify the assignee and service desk managers." />
      <Card>
        <ActionForm action={saveSlaAction} submitLabel="Save targets">
          <Table>
            <thead><tr><th>Priority</th><th>First response (hours)</th><th>Resolution (hours)</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.priority.toUpperCase()}</td>
                  <td><Input name={`resp_${r.priority}`} type="number" step="0.25" min={0.25} defaultValue={r.responseMinutes / 60} className="w-28" /></td>
                  <td><Input name={`res_${r.priority}`} type="number" step="0.25" min={0.25} defaultValue={r.resolveMinutes / 60} className="w-28" /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </ActionForm>
      </Card>
    </>
  );
}
