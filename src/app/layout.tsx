import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Jubilee · celebration planner", template: "%s · Jubilee" },
  description:
    "A GenAI planning assistant for weddings, birthdays and community events: budgets that add up, dated timelines, vendor checklists and personalised ideas.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#12142a" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Rendering per request lets Next.js attach the CSP nonce from src/proxy.ts to its own scripts.
  await connection();
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">Skip to the planner</a>
        <noscript>
          <p>Jubilee needs JavaScript to build your plan. Please enable it and reload this page.</p>
        </noscript>
        {children}
      </body>
    </html>
  );
}
