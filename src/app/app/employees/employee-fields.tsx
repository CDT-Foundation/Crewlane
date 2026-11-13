import { Field, Input, Select, Textarea } from "@/components/ui";
import type { employees } from "@/db/schema";

type Employee = typeof employees.$inferSelect;
type Option = { id: string; label: string };

export function EmployeeFields({
  e, units, grades, people, showSensitive, isNew,
}: {
  e?: Employee;
  units: Option[];
  grades: Option[];
  people: Option[];
  showSensitive: boolean;
  isNew?: boolean;
}) {
  const left = e?.status === "resigned" || e?.status === "terminated";
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name"><Input name="firstName" defaultValue={e?.firstName} required /></Field>
        <Field label="Last name"><Input name="lastName" defaultValue={e?.lastName} required /></Field>
        <Field label="Work email"><Input name="workEmail" type="email" defaultValue={e?.workEmail ?? ""} /></Field>
        <Field label="Personal email"><Input name="personalEmail" type="email" defaultValue={e?.personalEmail ?? ""} /></Field>
        <Field label="Phone"><Input name="phone" defaultValue={e?.phone ?? ""} /></Field>
        <Field label="Job title"><Input name="jobTitle" defaultValue={e?.jobTitle ?? ""} /></Field>
        <Field label="Org unit">
          <Select name="orgUnitId" defaultValue={e?.orgUnitId ?? ""}>
            <option value="">—</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </Select>
        </Field>
        <Field label="Job grade">
          <Select name="jobGradeId" defaultValue={e?.jobGradeId ?? ""}>
            <option value="">—</option>
            {grades.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </Select>
        </Field>
        <Field label="Reports to">
          <Select name="managerId" defaultValue={e?.managerId ?? ""}>
            <option value="">—</option>
            {people.filter((p) => p.id !== e?.id).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </Select>
        </Field>
        <Field label="Dotted-line manager">
          <Select name="dottedManagerId" defaultValue={e?.dottedManagerId ?? ""}>
            <option value="">—</option>
            {people.filter((p) => p.id !== e?.id).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </Select>
        </Field>
        <Field label="Employment type">
          <Select name="employmentType" defaultValue={e?.employmentType ?? "permanent"}>
            <option value="permanent">Permanent</option>
            <option value="contract">Contract</option>
            <option value="intern">Intern</option>
            <option value="casual">Casual</option>
          </Select>
        </Field>
        <Field label="Date of joining"><Input name="hireDate" type="date" defaultValue={e?.hireDate ?? ""} /></Field>
        <Field label="Status" hint={left ? "This person has left. Status is locked." : "Resignation and termination go through approval."}>
          <Select name="status" defaultValue={e?.status ?? "preboarding"} disabled={left}>
            {left ? <option value={e!.status}>{e!.status}</option> : null}
            <option value="preboarding">Pre-boarding</option>
            <option value="probation">Probation</option>
            <option value="active">Active</option>
          </Select>
        </Field>
      </div>

      {showSensitive && !isNew ? (
        <fieldset className="space-y-4 rounded-lg border border-amber-200 bg-amber-50/40 p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-amber-800">Restricted</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="National ID (NIC)"><Input name="nationalId" defaultValue={e?.nationalId ?? ""} /></Field>
            <Field label="Passport no."><Input name="passportNo" defaultValue={e?.passportNo ?? ""} /></Field>
            <Field label="Passport expiry"><Input name="passportExpiry" type="date" defaultValue={e?.passportExpiry ?? ""} /></Field>
            <Field label="Visa expiry"><Input name="visaExpiry" type="date" defaultValue={e?.visaExpiry ?? ""} /></Field>
            <Field label="Emergency contact"><Input name="emergencyContact" defaultValue={e?.emergencyContact ?? ""} /></Field>
          </div>
          <Field label="Address"><Textarea name="address" defaultValue={e?.address ?? ""} rows={2} /></Field>
        </fieldset>
      ) : null}
    </div>
  );
}
