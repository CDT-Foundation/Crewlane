import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { employees, letterTemplates, letters } from "@/db/schema";
import { fullName } from "@/lib/employees";
import { formatDate, LETTER_PLACEHOLDERS } from "@/lib/letters";
import { requirePage, tenantTx } from "@/lib/session";
import { saveTemplateAction } from "./actions";

export default async function LettersPage() {
  const ctx = await requirePage("letters.manage");
  const { templates, recent } = await tenantTx(ctx, async (tx) => ({
    templates: await tx.select().from(letterTemplates).orderBy(asc(letterTemplates.name)),
    recent: await tx
      .select({ l: letters, firstName: employees.firstName, lastName: employees.lastName })
      .from(letters)
      .innerJoin(employees, eq(employees.id, letters.employeeId))
      .orderBy(desc(letters.issuedAt))
      .limit(15),
  }));

  return (
    <>
      <PageHeader
        title="Letter templates"
        description="Appointment, confirmation, increment and warning letters. Issue them from an employee's profile; every issued letter carries a verification hash."
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {templates.map((t) => (
            <details key={t.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer text-sm font-medium">{t.name} <span className="font-mono text-xs font-normal text-slate-500">{t.key}</span></summary>
              <div className="mt-4">
                <ActionForm action={saveTemplateAction.bind(null, t.id)} submitLabel="Save template">
                  <Field label="Name"><Input name="name" defaultValue={t.name} required /></Field>
                  <Field label="Body"><Textarea name="body" defaultValue={t.body} rows={16} className="font-mono text-xs" required /></Field>
                </ActionForm>
              </div>
            </details>
          ))}
          <Card title="New template">
            <ActionForm action={saveTemplateAction.bind(null, null)} submitLabel="Create template" resetOnSuccess>
              <Field label="Name"><Input name="name" placeholder="Transfer letter" required /></Field>
              <Field label="Body"><Textarea name="body" rows={10} className="font-mono text-xs" required /></Field>
            </ActionForm>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Placeholders">
            <ul className="space-y-1 text-sm">
              {Object.entries(LETTER_PLACEHOLDERS).map(([k, label]) => (
                <li key={k}><code className="rounded bg-slate-100 px-1 text-xs">{`{{${k}}}`}</code> <span className="text-slate-500">{label}</span></li>
              ))}
            </ul>
          </Card>
          <Card title="Recently issued">
            <ul className="space-y-1 text-sm">
              {recent.map(({ l, firstName, lastName }) => (
                <li key={l.id}>
                  <Link className="text-brand hover:underline" href={`/app/letters/issued/${l.id}`}>{l.title}</Link>
                  <span className="text-slate-500"> · {fullName({ firstName, lastName })} · {formatDate(l.issuedAt, ctx.tenant.timezone)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
