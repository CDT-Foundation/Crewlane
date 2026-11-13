"use client";

import { useEffect, useState } from "react";

type Toast = { id: number; text: string; tone: "ok" | "error"; sticky: boolean };
const EVENT = "crewlane:toast";

/** Show a toast from anywhere on the client. */
export function toast(text: string, tone: "ok" | "error" = "ok") {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { text, tone } }));
}

/**
 * Confirmations that survive the page refreshing after a server action, e.g.
 * when the button that was clicked disappears. Long messages (one-time links,
 * tokens, passwords) stay until they are dismissed.
 */
export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    let n = 0;
    const onToast = (e: Event) => {
      const { text, tone } = (e as CustomEvent<{ text: string; tone: "ok" | "error" }>).detail;
      const id = ++n;
      const sticky = text.length > 90 || /https?:\/\/|cla_|password/i.test(text);
      setItems((xs) => [...xs.slice(-3), { id, text, tone, sticky }]);
      if (!sticky) setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4500);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);
  if (!items.length) return null;
  return (
    <div className="no-print pointer-events-none fixed right-4 bottom-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          data-toast
          className={`pointer-events-auto flex items-start gap-3 rounded-lg border p-3 text-sm shadow-lg ${t.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}
        >
          <span className="min-w-0 flex-1 break-words select-all">{t.text}</span>
          <button type="button" aria-label="Dismiss" className="text-slate-500 hover:text-slate-900" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
