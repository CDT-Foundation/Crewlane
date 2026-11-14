"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, Input, Select, buttonClass } from "@/components/ui";
import { type SignupState, signupAction } from "../auth-actions";

const COUNTRIES = [
  { code: "LK", name: "Sri Lanka", currency: "LKR", tz: "Asia/Colombo" },
  { code: "IN", name: "India", currency: "INR", tz: "Asia/Kolkata" },
  { code: "AE", name: "United Arab Emirates", currency: "AED", tz: "Asia/Dubai" },
  { code: "SG", name: "Singapore", currency: "SGD", tz: "Asia/Singapore" },
  { code: "GB", name: "United Kingdom", currency: "GBP", tz: "Europe/London" },
  { code: "SE", name: "Sweden", currency: "SEK", tz: "Europe/Stockholm" },
  { code: "DE", name: "Germany", currency: "EUR", tz: "Europe/Berlin" },
  { code: "US", name: "United States", currency: "USD", tz: "America/New_York" },
];

const STEPS = ["Organisation", "Region", "Your account"] as const;

function toSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={buttonClass("primary")} disabled={pending}>
      {pending ? "Creating your organisation…" : "Create organisation"}
    </button>
  );
}

export function SignupWizard({ rootDomain }: { rootDomain: string }) {
  const [state, action] = useActionState<SignupState, FormData>(signupAction, null);
  const [step, setStep] = useState(0);
  const [orgName, setOrgName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [legalEntityName, setLegalEntityName] = useState("");
  const [legalEntityTouched, setLegalEntityTouched] = useState(false);
  const [country, setCountry] = useState(COUNTRIES[0]);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.redirectTo) window.location.assign(state.redirectTo);
  }, [state]);

  function next() {
    const form = formRef.current;
    if (!form) return;
    // Validate only the fields on the visible step before moving on.
    const fields = form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      `[data-step="${step}"] input, [data-step="${step}"] select`,
    );
    for (const f of fields) {
      if (!f.reportValidity()) return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  return (
    <form
      ref={formRef}
      action={action}
      noValidate
      onKeyDown={(e) => {
        if (e.key === "Enter" && step < STEPS.length - 1) {
          e.preventDefault();
          next();
        }
      }}
      onSubmit={(e) => {
        const form = formRef.current;
        if (!form) return;
        for (let s = 0; s < STEPS.length; s++) {
          const fields = form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
            `[data-step="${s}"] input, [data-step="${s}"] select`,
          );
          for (const f of fields) {
            if (!f.checkValidity()) {
              e.preventDefault();
              setStep(s);
              setTimeout(() => f.reportValidity(), 0);
              return;
            }
          }
        }
      }}
      className="space-y-6"
    >
      <ol className="flex gap-2 text-xs font-medium">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`flex-1 rounded-full px-3 py-1.5 text-center ${i <= step ? "bg-brand text-white" : "bg-slate-100 text-slate-500"}`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      <div data-step="0" className={step === 0 ? "space-y-4" : "hidden"}>
        <Field label="Organisation name">
          <Input
            name="orgName"
            required
            minLength={2}
            value={orgName}
            onChange={(e) => {
              const val = e.target.value;
              setOrgName(val);
              if (!slugTouched) setSlug(toSlug(val));
              if (!legalEntityTouched) setLegalEntityName(val ? `${val} (Pvt) Ltd` : "");
            }}
          />
        </Field>
        <Field label="Crewlane address" hint={`Your team signs in at ${slug || "your-company"}.${rootDomain}`}>
          <Input
            name="slug"
            required
            pattern="[a-z][a-z0-9\-]{1,30}[a-z0-9]"
            title="3-32 lowercase letters, numbers or hyphens"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
          />
        </Field>
        <Field label="Legal entity name" hint="Shown on letters. You can add more entities and business units later.">
          <Input
            name="legalEntityName"
            required
            minLength={2}
            value={legalEntityName}
            onChange={(e) => {
              setLegalEntityTouched(true);
              setLegalEntityName(e.target.value);
            }}
            placeholder={orgName ? `${orgName} (Pvt) Ltd` : ""}
          />
        </Field>
        <Field label="Brand colour">
          <Input name="primaryColor" type="color" defaultValue="#1e3a5f" className="h-10 w-20 p-1" />
        </Field>
      </div>

      <div data-step="1" className={step === 1 ? "space-y-4" : "hidden"}>
        <Field label="Country of the main entity" hint="Sets the default currency, timezone and statutory pack.">
          <Select
            name="country"
            value={country.code}
            onChange={(e) => setCountry(COUNTRIES.find((c) => c.code === e.target.value) ?? COUNTRIES[0])}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Currency">
            <Input name="currency" key={`cur-${country.code}`} defaultValue={country.currency} required maxLength={3} minLength={3} />
          </Field>
          <Field label="Timezone">
            <Input name="timezone" key={`tz-${country.code}`} defaultValue={country.tz} required />
          </Field>
        </div>
      </div>

      <div data-step="2" className={step === 2 ? "space-y-4" : "hidden"}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="First name"><Input name="firstName" required autoComplete="given-name" /></Field>
          <Field label="Last name"><Input name="lastName" required autoComplete="family-name" /></Field>
        </div>
        <Field label="Job title"><Input name="jobTitle" placeholder="HR Director" /></Field>
        <Field label="Work email"><Input name="email" type="email" required autoComplete="email" /></Field>
        <Field label="Password" hint="At least 10 characters.">
          <Input name="password" type="password" required minLength={10} autoComplete="new-password" />
        </Field>
      </div>

      {state?.error ? <p role="alert" className="text-sm text-red-600">{state.error}</p> : null}

      <div className="flex justify-between">
        <button
          type="button"
          className={buttonClass("ghost")}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" className={buttonClass("primary")} onClick={next}>Continue</button>
        ) : (
          <Submit />
        )}
      </div>
    </form>
  );
}
