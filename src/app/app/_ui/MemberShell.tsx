"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LogoOE } from "@/shared/brand";
import { t } from "@/shared/copy/client";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { AreaSwitch } from "@/shared/ui/AreaSwitch";
import { NewBarWelcome } from "./NewBarWelcome";

// El marco de Mi OE (ADR-160 regla 1, con el aspecto de ADR-163; rama feat/rediseno): la barra es
// Hoy · Agenda · Asistencia · Juegos · Yo. Asistencia es el botón central y el único naranja del área.
// Desde 1024 px la barra va arriba; por debajo, abajo, al alcance del pulgar. «Más» se fue: lo suyo
// vive en «Yo». El layout de servidor entrega cada pestaña con sus iconos ya renderizados (ADR-076
// regla 5) y las rutas que la marcan activa.

type Tab = {
  href: string;
  label: string;
  icon: ReactNode;
  iconActive: ReactNode;
  /** Otras rutas que cuentan como esta pestaña: «Yo» y sus destinos, «Asistencia» y el carnet. */
  also?: string[];
  central?: boolean;
};

function isUnder(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MemberShell({
  children,
  tabs,
  theme,
  canAccessAdmin,
  welcome,
}: {
  children: ReactNode;
  tabs: Tab[];
  theme: ReactNode;
  canAccessAdmin: boolean;
  welcome: { title: string; text: string; button: string };
}) {
  const pathname = usePathname();
  const active = (tab: Tab) =>
    tab.href === "/app"
      ? pathname === "/app"
      : [tab.href, ...(tab.also ?? [])].some((href) => isUnder(pathname, href));
  return (
    <div className="member-shell fondo-sobrio" data-capa="funcional">
      <a className="member-skip-link" href="#member-content">
        {t("T-035")}
      </a>
      <header className="member-topbar">
        <div className="member-topbar-inner">
          <Link href="/app" className="member-brand" aria-label={t("T-1660")}>
            <LogoOE height={40} />
            <span>{t("T-1660")}</span>
          </Link>
          <nav className="member-primary-nav" aria-label={t("T-1663")}>
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active(tab) ? "page" : undefined}
                data-central={tab.central ? "true" : undefined}
              >
                <span className="member-tab-icon">{active(tab) ? tab.iconActive : tab.icon}</span>
                <span>{tab.label}</span>
              </Link>
            ))}
          </nav>
          <div className="member-utilities">
            {canAccessAdmin ? <AreaSwitch to="admin" /> : null}
            {theme}
          </div>
        </div>
      </header>
      <main id="member-content" tabIndex={-1} className="member-content">
        {pathname === "/app" ? <NewBarWelcome {...welcome} /> : null}
        {children}
      </main>
    </div>
  );
}
