import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
export const metadata: Metadata = {
  title: "SAN.AI — Анализ организационных изменений",
  description:
    "Сравнение документов до и после реорганизации: структуры, изменения функций, источники и рекомендации.",
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
