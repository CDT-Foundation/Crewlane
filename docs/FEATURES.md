# Crewlane — Feature Overview

Crewlane is a multi-tenant HR, payroll and IT platform with private, in-house AI. It is organised as four pillars on one shared foundation and built in four phases over 28 weeks.

- **Executive Project Brief & Quick Start:** [`README.md`](../README.md)
- **Technical Architecture & Developer Reference:** [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)

**Status legend:** ✅ Built (Phases 1–2) · 🔜 Planned (phase noted)

---

## Foundation — multi-tenant core ✅

- **Multi-tenancy:** one product serves many organisations, each with its own subdomain, branding, custom domain, currency, timezone and country settings.
- **Database-level isolation:** every tenant table is protected by Postgres row-level security, so one organisation can never see another's data.
- **Onboarding wizard:** creates a new organisation with default roles, job grades, letter templates and approval workflows.
- **Organisation builder:** legal entities, business units, branches, factories, departments, cost centres and locations, plus job grades. No code changes needed.
- **Roles and access control:** custom roles, each assignment scoped to self, direct reports, department or the whole company. Nobody can grant more access than they hold.
- **No-code workflow builder:** approval chains with steps and conditions (e.g. "if cost exceeds $1,500, require Finance Director approval").
- **Maker-checker:** high-risk actions need a second, independent officer. Enforced in the database as well as the app.
- **Immutable audit trail:** records who, which tenant, IP address, and before/after values. Append-only and hash-chained for ISO 27001, SOC 2 and financial audits.

---

## Pillar 1 — Digital HR, workforce and payroll

### Core HR ✅
- Employee profiles, an org chart with dotted-line managers, and passport and visa expiry alerts.
- Scoped employee directory, with sensitive fields (ID, passport, bank) masked by permission.
- Digital letters: appointment, confirmation, increment and warning, with verification hashes.
- Candidate pre-boarding portal: new hires submit their personal, ID and bank details through a secure one-time link.
- Resignation and termination through approval.

### Time and attendance 🔜 Phase 3
- Biometric devices (ZKTeco, Hikvision, Suprema), mobile GPS with a selfie check, and web check-in.
- Fixed, rotating, split and 24/7 factory shifts; shift and roster planner.
- Automatic overtime calculation and missed-punch requests.

### Leave 🔜 Phase 3
- Policies by grade and contract type, pro-rata accrual, carry-forward limits and encashment formulas.
- Holiday calendars and a team conflict calendar for managers.

### Payroll and statutory compliance 🔜 Phase 3
- Formula builder for pay elements; one-click attendance-to-payroll sync.
- Staff loans and advances.
- Sri Lanka EPF, ETF, APIT and gratuity; extensible to UAE WPS, Singapore CPF, UK PAYE and more.
- Bank payment files (SLIPS, CEFT), month-over-month variance reports, accounting journal exports.
- Multi-currency payroll and encrypted payslips.

### Recruitment, performance and learning 🔜 Phase 4
- Branded career page, AI CV ranking, interview scorecards, digital offer letters.
- Goals and OKRs, 360° appraisals, 9-box talent grid.
- Training courses, quizzes and skills-gap analysis.

---

## Pillar 2 — Enterprise asset, identity and IT service management ✅ Phase 2

- **Equipment requests:** self-service or by a manager, approved by the requester's line manager (or whoever covers for them), with a second step above a threshold; filled from stock automatically.
- **Asset requests and procurement:** multi-asset requests with approval stages; out-of-stock requests become vendor quotations, purchase orders and goods-received notes that update inventory automatically.
- **Asset inventory and depreciation:** QR, barcode and RFID labels; full custody chain from available to disposed; digital handover and return forms with e-signature; straight-line and written-down-value depreciation for Finance.
- **IT service desk:** tickets from the web portal, email, Microsoft Teams, Slack, WhatsApp and factory kiosks (signed inbound webhook, replies thread by ticket number); least-loaded auto-assignment; Kanban board with live SLA timers and breach alerts, internal notes, satisfaction ratings and asset-linked incident history.
- **Identity and access management:** Google Workspace and Microsoft 365 / Entra ID integration to create accounts, assign groups, force password resets and revoke sessions automatically.
- **Software, licence and telecom billing:** seat tracking, renewal reminders (30, 14 and 7 days ahead), cost allocation by business unit, invoice vault and corporate mobile usage monitoring.

---

## Pillar 3 — Enterprise and industrial differentiators (✅ items 1, 2, 5, 8, 11, 13 built; others 🔜 Phases 3–4)

1. **Hire-to-retire automation and offboarding gate:** ✅ a hire automatically creates the profile, an email-setup ticket, an equipment request and Day-1 training. A resignation creates a clearance ticket for every asset, and payroll **blocks final settlement and gratuity** until everything is returned. Losses flow into payroll as deductions.
2. **Leave-aware routing:** ✅ approvals and urgent tickets move to the acting officer when someone is on leave.
3. **Canteen, meal subsidy and staff transport:** biometric meal tracking with payroll deduction, caterer invoices, shuttle routes and rosters.
4. **Health, safety and PPE:** issue and replacement schedules, incident and near-miss reporting, investigation workflows, insurance claims (ISO 45001 / OSHA support).
5. **Material and asset gate passes:** ✅ returnable and non-returnable passes scanned by security via QR, with overdue alerts.
6. **Offline-first factory kiosk:** shared tablets with badge or PIN login for payslips, overtime, leave and fault reports in English, Sinhala or Tamil, even without internet.
7. **AI expense claims and mileage:** photograph a receipt; the local AI reads it, flags duplicates, checks policy and routes it to petty cash or the next payslip.
8. **Device discovery agent:** ✅ optional agent plus Intune / Google endpoint sync reporting hardware specs, health and installed software.
9. **Facilities, visitor and fleet management:** room and hot-desk booking, QR visitor passes with photo and NDA, pool vehicle booking with odometer photos and renewal alerts.
10. **Engagement and whistleblower vault:** pulse surveys, eNPS, peer recognition and an end-to-end encrypted anonymous reporting box.
11. **Telecom bill splitter:** ✅ compares mobile bills with each role's allowance and routes personal excess to payroll deduction.
12. **WhatsApp and Microsoft Teams bot:** leave balances, payslips and fault reports by text or voice note; one-tap approvals for managers.
13. **Maker-checker and immutable audit trail:** ✅ already built in Phase 1.

---

## Pillar 4 — Ownmind private local AI 🔜 Phase 4

AI that runs on Crewlane's own GPU servers or inside the customer's data centre (including air-gapped), so salaries, IDs and medical data never leave the organisation and there are no per-use AI fees.

| Capability | Models | What it powers |
| --- | --- | --- |
| HR and IT co-pilot | Qwen 2.5 14B or Llama 3.1 8B + LoRA adapters | IT troubleshooting, HR policy Q&A, drafting letters, ticket summaries, plain-English report filters |
| Payroll and financial auditor | DeepSeek-R1 14B | Checking payroll runs, salary and overtime anomalies, tax formula verification, budget forecasts |
| Document reading (OCR) | Qwen2.5-VL 7B or Llama 3.2 Vision + PaddleOCR | Receipts, national IDs, passports, medical certificates, invoices and CVs |
| Private knowledge search | bge-m3 or nomic-embed-text | Each tenant's handbooks and IT manuals (English, Sinhala, Tamil) |
| Voice and multilingual | Faster-Whisper | Voice notes from factory workers and drivers to log tickets or request leave |

- **In-house training:** per-tenant knowledge search (RAG) plus QLoRA fine-tuning on a single workstation GPU, with a monthly DPO pass learning from staff corrections.
- **Guardrails:** shared model weights learn only general skills; tenant-specific facts live only in the tenant-isolated vector store, with tenant and role filters applied before any context reaches the AI.

---

## Platform and DevOps ✅

- **Stack:** Next.js (TypeScript), PostgreSQL 16 with row-level security and pgvector, Drizzle ORM, Better-Auth.
- **Event bus:** transactional outbox with a background worker, so one department's action triggers work in another.
- **Container:** one image for the web app, worker and migrations, running as a non-root user.
- **Local development:** Docker Compose.
- **Kubernetes (Helm chart):** migration Job before every release, autoscaling, disruption budget, wildcard ingress, ServiceMonitor and NetworkPolicy.
- **GitOps:** Argo CD Application for staging.
- **CI/CD (GitHub Actions):**
  - Lint, typecheck and migration check.
  - Unit and integration tests against real Postgres.
  - Image build and push to GHCR, with a Trivy vulnerability scan.
- **Observability:** health and readiness probes, Prometheus metrics, structured JSON logs.
- **Integrations:** every outside system behind an adapter with a simulator; credentials encrypted with AES-256-GCM.
- **Notifications:** in-app inbox plus email through the outbox; S3-compatible file storage (MinIO in Docker Compose).

---

## Commercial models

- **Multi-tenant cloud subscription** (per employee per month):
  - Core + People and Payroll Cloud
  - Core + IT, Asset and Gate Pass Cloud
  - Workforce OS Enterprise Complete + Ownmind AI Bundle
- **On-premise "Ownmind Enterprise Appliance"** (annual licence): Docker or Kubernetes, deployed inside the client's own servers, for banks, defence, healthcare, government and large manufacturers that need air-gapped data.

---

## Roadmap

| Phase | Weeks | Scope | Status |
| --- | --- | --- | --- |
| 1 | 1–6 | Foundation, core HR and governance | ✅ Built |
| 2 | 7–12 | Asset and IT service management, onboarding/offboarding gate | ✅ Built |
| 3 | 13–20 | Time, attendance, leave and payroll, factory kiosk | 🔜 |
| 4 | 21–28 | Ownmind AI, talent (ATS, OKRs, LMS) and facilities | 🔜 |
