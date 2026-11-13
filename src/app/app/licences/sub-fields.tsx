import { Field, Input, Select, Textarea } from "@/components/ui";
import type { softwareSubscriptions } from "@/db/schema";

type Opt = { id: string; label: string };

export function SubscriptionFields({ s, vendors, units, people }: { s?: typeof softwareSubscriptions.$inferSelect; vendors: Opt[]; units: Opt[]; people: Opt[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label="Product"><Input name="product" defaultValue={s?.product} required placeholder="Microsoft 365 Business Standard" /></Field>
      <Field label="Plan"><Input name="plan" defaultValue={s?.plan ?? ""} /></Field>
      <Field label="Vendor">
        <Select name="vendorId" defaultValue={s?.vendorId ?? ""}>
          <option value="">—</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </Select>
      </Field>
      <Field label="Billing">
        <Select name="billingCycle" defaultValue={s?.billingCycle ?? "annual"}><option value="annual">Annual</option><option value="monthly">Monthly</option></Select>
      </Field>
      <Field label="Seats"><Input name="seatsTotal" type="number" min={1} defaultValue={s?.seatsTotal ?? 10} /></Field>
      <Field label="Price per seat (per billing period)"><Input name="costPerSeat" inputMode="decimal" defaultValue={s?.costPerSeat ?? ""} required /></Field>
      <Field label="Renewal date"><Input name="renewalDate" type="date" defaultValue={s?.renewalDate ?? ""} required /></Field>
      <Field label="Charge to (business unit)">
        <Select name="costUnitId" defaultValue={s?.costUnitId ?? ""}>
          <option value="">—</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
        </Select>
      </Field>
      <Field label="Owner">
        <Select name="ownerEmployeeId" defaultValue={s?.ownerEmployeeId ?? ""}>
          <option value="">—</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="autoRenew" defaultChecked={s?.autoRenew ?? true} /> Auto-renews</label>
      <Field label="Notes" className="sm:col-span-3"><Textarea name="notes" rows={2} defaultValue={s?.notes ?? ""} /></Field>
    </div>
  );
}
