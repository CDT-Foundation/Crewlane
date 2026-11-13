import { Field, Input, Select, Textarea } from "@/components/ui";
import type { assets } from "@/db/schema";

type Opt = { id: string; label: string };

export function AssetFields({ a, cats, vendors, units, isNew }: { a?: typeof assets.$inferSelect; cats: Opt[]; vendors: Opt[]; units: Opt[]; isNew?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Category">
        <Select name="categoryId" defaultValue={a?.categoryId ?? ""} required>
          <option value="">Choose…</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </Select>
      </Field>
      <Field label="Name"><Input name="name" defaultValue={a?.name} required placeholder="Dell Latitude 5450" /></Field>
      <Field label="Make"><Input name="make" defaultValue={a?.make ?? ""} /></Field>
      <Field label="Model"><Input name="model" defaultValue={a?.model ?? ""} /></Field>
      <Field label="Serial number"><Input name="serialNo" defaultValue={a?.serialNo ?? ""} /></Field>
      <Field label="RFID tag"><Input name="rfid" defaultValue={a?.rfid ?? ""} /></Field>
      <Field label="Purchase date"><Input name="purchaseDate" type="date" defaultValue={a?.purchaseDate ?? ""} /></Field>
      <Field label="Warranty until"><Input name="warrantyUntil" type="date" defaultValue={a?.warrantyUntil ?? ""} /></Field>
      <Field label="Purchase cost"><Input name="purchaseCost" inputMode="decimal" defaultValue={a?.purchaseCost ?? ""} /></Field>
      <Field label="Salvage value"><Input name="salvageValue" inputMode="decimal" defaultValue={a?.salvageValue ?? "0"} /></Field>
      <Field label="Vendor">
        <Select name="vendorId" defaultValue={a?.vendorId ?? ""}>
          <option value="">—</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </Select>
      </Field>
      <Field label="Location">
        <Select name="locationUnitId" defaultValue={a?.locationUnitId ?? ""}>
          <option value="">—</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
        </Select>
      </Field>
      <Field label="Condition">
        <Select name="condition" defaultValue={a?.condition ?? "new"}>
          {["new", "good", "fair", "poor", "damaged"].map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </Field>
      {isNew ? <Field label="Quantity" hint="Adds identical items with their own tags."><Input name="quantity" type="number" min={1} max={50} defaultValue={1} /></Field> : null}
      <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" defaultValue={a?.notes ?? ""} rows={2} /></Field>
    </div>
  );
}
