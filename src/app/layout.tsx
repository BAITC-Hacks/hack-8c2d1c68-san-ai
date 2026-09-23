import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
export const metadata: Metadata = {
  title: "San.ai — Анализ организации",
  description:
    "Демонстрационный стенд анализа организационной структуры. 20 000 синтетических сотрудников.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}
