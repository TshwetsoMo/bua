// bua/src/app/layout.tsx
import React from "react";
import "./globals.css";
import Providers from "./providers";

export const metadata = {
  title: "Bua - School Support Platform",
  description:
    "Bua gives students a safe, simple way to get answers about school life, report problems, and see action taken.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 dark:bg-slate-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

