/** Letter templates use {{placeholders}}. Output is plain text (never HTML). */

export const LETTER_PLACEHOLDERS: Record<string, string> = {
  "employee.fullName": "Employee full name",
  "employee.firstName": "First name",
  "employee.employeeNo": "Employee number",
  "employee.jobTitle": "Job title",
  "employee.department": "Department / unit",
  "employee.grade": "Job grade",
  "employee.hireDate": "Date of joining",
  "tenant.name": "Organisation name",
  "today": "Today's date",
  "issuer.name": "Person issuing the letter",
};

export function renderTemplate(body: string, vars: Record<string, string | null | undefined>) {
  const missing = new Set<string>();
  const text = body.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    if (v === undefined || v === null || v === "") {
      missing.add(key);
      return `[${key}]`;
    }
    return v;
  });
  return { text, missing: [...missing] };
}

export function formatDate(d: Date | string | null | undefined, timeZone = "Asia/Colombo") {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone }).format(date);
}

export const DEFAULT_LETTER_TEMPLATES = [
  {
    key: "appointment",
    name: "Letter of appointment",
    body: `{{today}}

Dear {{employee.fullName}},

LETTER OF APPOINTMENT

We are pleased to appoint you as {{employee.jobTitle}} ({{employee.grade}}) in {{employee.department}} at {{tenant.name}}, with effect from {{employee.hireDate}}. Your employee number is {{employee.employeeNo}}.

You will be on probation for six months from your date of joining. The terms and conditions of your employment are set out in the attached schedule and the company handbook.

Please sign and return a copy of this letter to confirm your acceptance.

Yours sincerely,

{{issuer.name}}
For and on behalf of {{tenant.name}}`,
  },
  {
    key: "confirmation",
    name: "Confirmation of employment",
    body: `{{today}}

Dear {{employee.fullName}},

CONFIRMATION OF EMPLOYMENT

We are pleased to confirm that you have successfully completed your probation period. Your employment as {{employee.jobTitle}} is confirmed with effect from today.

Thank you for your contribution to {{tenant.name}}.

Yours sincerely,

{{issuer.name}}`,
  },
  {
    key: "increment",
    name: "Salary increment",
    body: `{{today}}

Dear {{employee.fullName}},

SALARY INCREMENT

In recognition of your performance, we are pleased to inform you that your salary has been revised. The revised amount is set out in your payslip schedule.

Yours sincerely,

{{issuer.name}}`,
  },
  {
    key: "warning",
    name: "Warning letter",
    body: `{{today}}

Dear {{employee.fullName}},

WARNING

This letter is a formal warning regarding the matter discussed with you. Any repetition may lead to further disciplinary action in line with company policy.

Please acknowledge receipt of this letter.

{{issuer.name}}`,
  },
];
