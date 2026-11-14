import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Sora } from "next/font/google";
import { ThemeScript } from "@/components/theme-script";
import { currentTenant } from "@/lib/tenancy";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
});

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await currentTenant().catch(() => null);
  return {
    title: tenant ? `${tenant.name} · Crewlane` : "Crewlane — Unified Workforce & IT OS",
    description: "HR, payroll and IT on one multi-tenant platform with private, in-house AI.",
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const tenant = await currentTenant().catch(() => null);
  const brand = tenant?.branding.primaryColor ?? "#1e3a5f";

  return (
    <html lang="en" suppressHydrationWarning className={sora.variable}>
      <head>
        <ThemeScript />
      </head>
      <body
        className="min-h-screen font-sans antialiased text-slate-900 bg-slate-50 selection:bg-brand/20 dark:bg-[#090d16] dark:text-slate-100"
        style={{ "--brand": brand } as CSSProperties}
      >
        {children}
      </body>
    </html>
  );
}
