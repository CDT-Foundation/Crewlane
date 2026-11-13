import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { currentTenant } from "@/lib/tenancy";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await currentTenant().catch(() => null);
  return {
    title: tenant ? `${tenant.name} · Crewlane` : "Crewlane",
    description: "HR, payroll and IT on one multi-tenant platform with private, in-house AI.",
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const tenant = await currentTenant().catch(() => null);
  const brand = tenant?.branding.primaryColor ?? "#1e3a5f";
  return (
    <html lang="en">
      <body className="min-h-screen antialiased" style={{ "--brand": brand } as CSSProperties}>
        {children}
      </body>
    </html>
  );
}
