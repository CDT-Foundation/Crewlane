"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { BuildingIcon, CheckCircleIcon, GlobeIcon, SpinnerIcon, UserIcon } from "@/components/icons";
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

const BRAND_PRESETS = [
  "#1e3a5f", // Navy
  "#0ea5e9", // Sky
  "#6366f1", // Indigo
  "#10b981", // Emerald
  "#8b5cf6", // Purple
  "#0f172a", // Slate
];

const STEPS = [
  { label: "Organisation", icon: BuildingIcon },
  { label: "Region & Tax", icon: GlobeIcon },
  { label: "Admin Account", icon: UserIcon },
] as const;

function toSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={buttonClass("primary")} disabled={pending}>
      {pending ? (
        <span className="flex items-center gap-2">
          <SpinnerIcon size={16} className="animate-spin shrink-0" />
          <span>Provisioning Tenant…</span>
        </span>
      ) : (
        "Create organisation →"
      )}
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
  const [primaryColor, setPrimaryColor] = useState("#1e3a5f");
  const [country, setCountry] = useState(COUNTRIES[0]);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.redirectTo) window.location.assign(state.redirectTo);
  }, [state]);

  function next() {
    const form = formRef.current;
    if (!form) return;
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
      {/* Modern Frosted Step Indicator */}
      <ol className="flex items-center gap-2 rounded-2xl border border-slate-200/60 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 p-1.5 backdrop-blur-md">
        {STEPS.map((s, i) => {
          const isDone = i < step;
          const isActive = i === step;
          const StepIcon = s.icon;
          return (
            <li
              key={s.label}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 px-1 text-center text-xs font-semibold transition-all duration-300 ${
                isActive
                  ? "bg-brand text-white shadow-md shadow-brand/25 dark:shadow-brand/40"
                  : isDone
                    ? "bg-brand/10 text-brand dark:bg-brand/20 dark:text-cyan-300"
                    : "text-slate-400 dark:text-slate-500"
              }`}
            >
              {isDone ? <CheckCircleIcon size={14} className="shrink-0" /> : <StepIcon size={14} className="shrink-0" />}
              <span className="hidden sm:inline">{s.label}</span>
            </li>
          );
        })}
      </ol>

      {/* Step 0: Organisation Details */}
      <div data-step="0" className={step === 0 ? "space-y-4 animate-fade-in" : "hidden"}>
        <Field label="Organisation Name">
          <Input
            name="orgName"
            required
            minLength={2}
            placeholder="Acme Corporation"
            value={orgName}
            onChange={(e) => {
              const val = e.target.value;
              setOrgName(val);
              if (!slugTouched) setSlug(toSlug(val));
              if (!legalEntityTouched) setLegalEntityName(val ? `${val} (Pvt) Ltd` : "");
            }}
          />
        </Field>

        <Field
          label="Crewlane Address"
          hint={`Your team signs in at: ${slug || "your-company"}.${rootDomain}`}
        >
          <div className="relative">
            <Input
              name="slug"
              required
              pattern="[a-z][a-z0-9\-]{1,30}[a-z0-9]"
              title="3-32 lowercase letters, numbers or hyphens"
              placeholder="acme"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase());
              }}
              className="pr-36"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-xs font-medium text-slate-400">
              .{rootDomain}
            </span>
          </div>
        </Field>

        <Field
          label="Legal Entity Name"
          hint="Appears on digital letters, contracts, and payslips."
        >
          <Input
            name="legalEntityName"
            required
            minLength={2}
            value={legalEntityName}
            onChange={(e) => {
              setLegalEntityTouched(true);
              setLegalEntityName(e.target.value);
            }}
            placeholder={orgName ? `${orgName} (Pvt) Ltd` : "Acme Corporation (Pvt) Ltd"}
          />
        </Field>

        <Field label="Brand Accent Colour">
          <div className="flex items-center gap-3">
            <input
              type="color"
              name="primaryColor"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="size-10 cursor-pointer rounded-xl border border-slate-200/80 dark:border-white/10 bg-transparent p-1 backdrop-blur-md"
            />
            <div className="flex flex-wrap gap-1.5">
              {BRAND_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setPrimaryColor(color)}
                  style={{ backgroundColor: color }}
                  className={`size-7 rounded-lg border transition-transform hover:scale-110 ${
                    primaryColor === color ? "ring-2 ring-brand ring-offset-2 dark:ring-offset-slate-900 border-white" : "border-transparent"
                  }`}
                  aria-label={`Select ${color}`}
                />
              ))}
            </div>
          </div>
        </Field>
      </div>

      {/* Step 1: Region & Financial Settings */}
      <div data-step="1" className={step === 1 ? "space-y-4 animate-fade-in" : "hidden"}>
        <Field label="Country of Primary Entity" hint="Configures statutory tax calculations, holidays, and labour laws.">
          <Select
            name="country"
            value={country.code}
            onChange={(e) => setCountry(COUNTRIES.find((c) => c.code === e.target.value) ?? COUNTRIES[0])}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Base Currency">
            <Input name="currency" key={`cur-${country.code}`} defaultValue={country.currency} required maxLength={3} minLength={3} />
          </Field>
          <Field label="Timezone">
            <Input name="timezone" key={`tz-${country.code}`} defaultValue={country.tz} required />
          </Field>
        </div>
      </div>

      {/* Step 2: Administrator Account */}
      <div data-step="2" className={step === 2 ? "space-y-4 animate-fade-in" : "hidden"}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="First Name">
            <Input name="firstName" required autoComplete="given-name" placeholder="Alex" />
          </Field>
          <Field label="Last Name">
            <Input name="lastName" required autoComplete="family-name" placeholder="Morgan" />
          </Field>
        </div>
        <Field label="Job Title">
          <Input name="jobTitle" placeholder="HR Director / Chief of Staff" />
        </Field>
        <Field label="Work Email">
          <Input name="email" type="email" required autoComplete="email" placeholder="alex@company.com" />
        </Field>
        <Field label="Master Password" hint="Minimum 10 characters for zero-trust security.">
          <Input name="password" type="password" required minLength={10} autoComplete="new-password" placeholder="••••••••••••" />
        </Field>
      </div>

      {/* Error state */}
      {state?.error ? (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3.5 text-xs text-rose-800 dark:text-rose-300 backdrop-blur-md">
          {state.error}
        </div>
      ) : null}

      {/* Wizard Action Controls */}
      <div className="flex items-center justify-between border-t border-slate-100 dark:border-white/5 pt-5">
        <button
          type="button"
          className={buttonClass("ghost")}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          ← Back
        </button>

        {step < STEPS.length - 1 ? (
          <button type="button" className={buttonClass("primary")} onClick={next}>
            Continue →
          </button>
        ) : (
          <Submit />
        )}
      </div>
    </form>
  );
}
