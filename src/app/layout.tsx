import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Crewlane",
  description: "Crewlane Next.js Application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
