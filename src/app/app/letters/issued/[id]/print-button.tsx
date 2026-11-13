"use client";

import { buttonClass } from "@/components/ui";

export function PrintButton() {
  return (
    <button type="button" className={buttonClass("secondary")} onClick={() => window.print()}>
      Print or save as PDF
    </button>
  );
}
