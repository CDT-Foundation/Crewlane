import { and, eq, gt, isNull } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { Field, Input, Textarea } from "@/components/ui";
import { employees, preboardingInvites } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { sha256Hex } from "@/lib/crypto";
import { currentTenant } from "@/lib/tenancy";
import { submitPreboardingAction } from "./actions";

export const metadata = { robots: { index: false } };

export default async function PreboardingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tenant = await currentTenant();
  const invite =
    tenant && /^[A-Za-z0-9_-]{20,100}$/.test(token)
      ? await withTenant({ tenantId: tenant.id }, async (tx) => {
          const [row] = await tx
            .select({ firstName: employees.firstName, jobTitle: employees.jobTitle, hireDate: employees.hireDate })
            .from(preboardingInvites)
            .innerJoin(employees, eq(employees.id, preboardingInvites.employeeId))
            .where(
              and(
                eq(preboardingInvites.tokenHash, sha256Hex(token)),
                isNull(preboardingInvites.submittedAt),
                gt(preboardingInvites.expiresAt, new Date()),
              ),
            );
          return row;
        })
      : undefined;

  if (!tenant || !invite) {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">This link is not active</h1>
          <p className="mt-2 text-sm text-slate-600">It may have expired or already been used. Please contact HR for a new link.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-6 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-lg bg-brand text-lg font-semibold text-white">{tenant.name.charAt(0)}</span>
        <div>
          <p className="text-sm text-slate-500">{tenant.name}</p>
          <h1 className="text-xl font-semibold">Welcome, {invite.firstName}</h1>
        </div>
      </div>
      <p className="mb-6 text-sm text-slate-600">
        Before you join{invite.jobTitle ? ` as ${invite.jobTitle}` : ""}, please fill in the details below so HR can set up your
        employee record and payroll. This information is visible only to authorised HR staff.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <ActionForm action={submitPreboardingAction.bind(null, token)} submitLabel="Submit my details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Personal email"><Input name="personalEmail" type="email" required /></Field>
            <Field label="Mobile number"><Input name="phone" type="tel" required /></Field>
            <Field label="National ID (NIC)"><Input name="nationalId" required /></Field>
            <Field label="Emergency contact" hint="Name and phone"><Input name="emergencyContact" required /></Field>
            <Field label="Passport number (if any)"><Input name="passportNo" /></Field>
            <Field label="Passport expiry"><Input name="passportExpiry" type="date" /></Field>
            <Field label="Bank and branch"><Input name="bankName" required /></Field>
            <Field label="Account number for salary"><Input name="bankAccount" inputMode="numeric" required /></Field>
          </div>
          <Field label="Home address"><Textarea name="address" rows={3} required /></Field>
        </ActionForm>
      </div>
    </main>
  );
}
