"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div className="app-shell"><div className="workspace">
    <header className="topbar"><Link href="/" className="brand-name" aria-label="SAN.AI — Документы">SAN<span>.AI</span></Link><span className="workspace-label">Анализ организационных изменений</span><span className="case-label">Кейс АО «Казахтелеком»</span>{pathname === "/structure" && <Link href="/" className="back-to-analysis">К анализу документов</Link>}</header>
    {children}
  </div></div>;
}
