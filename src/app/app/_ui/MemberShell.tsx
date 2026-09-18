"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { LogoOE } from "@/shared/brand";
import { t } from "@/shared/copy";
import { AreaSwitch } from "@/shared/ui/AreaSwitch";
import { ArrowUpRightIcon } from "@/shared/ui/icons/ArrowUpRightIcon";
import { Menu2Icon } from "@/shared/ui/icons/Menu2Icon";

type Destination = { href: string; label: string };
// El layout de servidor entrega cada pestaña con su icono ya renderizado (ADR-076 regla 5): el
// relleno marca la pestaña activa, como señal adicional al color.
type Tab = Destination & { icon: ReactNode; iconActive: ReactNode };
type Group = { label: string; items: Destination[] };

export function MemberShell({
  children,
  primary,
  groups,
  theme,
  account,
  canAccessAdmin,
}: {
  children: ReactNode;
  primary: Tab[];
  groups: Group[];
  theme: ReactNode;
  account: ReactNode;
  canAccessAdmin: boolean;
}) {
  const pathname = usePathname();
  const drawer = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const active = (href: string) =>
    href === "/app" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  useEffect(() => {
    if (pathname) drawer.current?.close();
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  return (
    <div className="member-shell">
      <a className="member-skip-link" href="#member-content">
        {t("T-035")}
      </a>
      <header className="member-topbar">
        <div className="member-topbar-inner">
          <Link href="/app" className="member-brand" aria-label={t("T-1660")}>
            <LogoOE height={44} />
            <span>{t("T-1660")}</span>
          </Link>
          <nav className="member-primary-nav" aria-label={t("T-1663")}>
            {primary.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active(item.href) ? "page" : undefined}
              >
                {active(item.href) ? item.iconActive : item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
            <button
              ref={trigger}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls="member-menu"
              className={
                groups.some((group) => group.items.some((item) => active(item.href)))
                  ? "member-menu-current"
                  : undefined
              }
              onClick={() => {
                drawer.current?.showModal();
                setOpen(true);
              }}
            >
              <Menu2Icon size={22} />
              <span>{t("T-1662")}</span>
            </button>
          </nav>
          <div className="member-utilities">
            {canAccessAdmin ? <AreaSwitch to="admin" /> : null}
            {theme}
          </div>
        </div>
      </header>
      <main id="member-content" tabIndex={-1} className="member-content">
        {children}
      </main>
      <dialog
        id="member-menu"
        ref={drawer}
        className="member-menu"
        aria-labelledby="member-menu-title"
        onClose={() => {
          setOpen(false);
          trigger.current?.focus({ preventScroll: true });
        }}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const elements = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              "a[href], button:not([disabled]), [tabindex='0']",
            ),
          ).filter((element) => element.getClientRects().length > 0);
          const first = elements[0];
          const last = elements.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <header className="member-menu-header">
          <h2 id="member-menu-title">{t("T-1660")}</h2>
          <button
            type="button"
            className="boton-secundario"
            onClick={() => drawer.current?.close()}
          >
            {t("T-291")}
          </button>
        </header>
        <nav aria-label={t("T-1683")}>
          {groups.map((group) => (
            <section key={group.label}>
              <h3>{group.label}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active(item.href) ? "page" : undefined}
                      onClick={() => drawer.current?.close()}
                    >
                      {item.label}
                      <ArrowUpRightIcon />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
        <footer className="member-menu-footer">{account}</footer>
      </dialog>
    </div>
  );
}
