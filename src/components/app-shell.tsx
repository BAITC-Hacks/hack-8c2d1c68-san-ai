"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Files, FlaskConical, Network } from "lucide-react";

const navigation = [
  { href: "/", label: "Документы ДО / ПОСЛЕ", Icon: Files },
  { href: "/structure", label: "Организационная структура", Icon: Network },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="rail">
        <div className="brand-mark" aria-label="San.ai">s<span>.</span></div>
        <div className="rail-divider" />
        <nav aria-label="Основное меню">
          {navigation.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={`rail-item${pathname === href ? " active" : ""}`}
              title={label}
              aria-label={label}
              aria-current={pathname === href ? "page" : undefined}
            >
              <Icon size={22} />
            </Link>
          ))}
        </nav>
        <div className="rail-bottom"><span className="avatar">SA</span></div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="brand-name">
            san<span>.ai</span>
            <span className="brand-separator">/</span>
            <span className="workspace-label">Рабочее пространство</span>
          </div>
          <span className="demo-pill"><FlaskConical size={13} /> Демо-среда</span>
        </header>
        {children}
      </div>
    </div>
  );
}
