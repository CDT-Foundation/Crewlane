import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { requirePage } from "@/lib/session";

const MODULES: Record<string, { title: string; phase: string; weeks: string; items: string[] }> = {
  payroll: {
    title: "Time, attendance, leave and payroll",
    phase: "Phase 3",
    weeks: "Weeks 13–20",
    items: [
      "Shift and roster planner; biometric (ZKTeco, Hikvision, Suprema), GPS and selfie clock-in",
      "Leave policies with accrual, carry-forward and team conflict calendar",
      "Multi-currency payroll: formula builder, loans, SLIPS/CEFT bank files, EPF/ETF/APIT",
      "Offline-first factory kiosk with badge or PIN",
    ],
  },
  ownmind: {
    title: "Ownmind private AI",
    phase: "Phase 4",
    weeks: "Weeks 21–28",
    items: [
      "Ollama / vLLM cluster on your own GPUs; HR and IT co-pilot with per-tenant knowledge search (pgvector)",
      "Local OCR for receipts, IDs, medical certificates and CVs",
      "Payroll anomaly auditor",
      "In-house QLoRA fine-tuning pipeline using anonymised feedback",
    ],
  },
};

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  await requirePage();
  const { module } = await params;
  const m = MODULES[module];
  if (!m) notFound();
  return (
    <>
      <PageHeader title={m.title} description={`${m.phase} · ${m.weeks} of the roadmap. Not built yet.`} />
      <Card title="Planned scope">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          {m.items.map((i) => <li key={i}>{i}</li>)}
        </ul>
      </Card>
    </>
  );
}
