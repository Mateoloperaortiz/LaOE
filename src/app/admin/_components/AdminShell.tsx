"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { AdminFormDrafts } from "@/shared/admin-kit/AdminFormDrafts";
import { type AdminNavGroup, activeAdminHref } from "@/shared/admin-kit/navigation";
import { LogoOE } from "@/shared/brand";
import { t } from "@/shared/copy";
import { AreaSwitch } from "@/shared/ui/AreaSwitch";

function Navigation({
  groups,
  showHome,
  onNavigate,
}: {
  groups: AdminNavGroup[];
  showHome: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const id = useId();
  const active = activeAdminHref(pathname, [
    ...(showHome ? ["/admin"] : []),
    ...groups.flatMap((group) => group.items.map((item) => item.href)),
  ]);
  const activeGroup = groups.find((group) => group.items.some((item) => item.href === active))?.id;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <nav aria-label={t("T-236")} className="admin-navigation">
      {showHome ? (
        <Link
          href="/admin"
          onClick={() => onNavigate?.()}
          aria-current={active === "/admin" ? "page" : undefined}
          className="admin-nav-home"
        >
          {t("T-1401")}
        </Link>
      ) : null}
      {groups.map((group) => {
        const open =
          expanded[group.id] ?? (group.id === activeGroup || (!activeGroup && group === groups[0]));
        return (
          <div key={group.id} className="admin-nav-group">
            <button
              type="button"
              className="admin-nav-group-toggle"
              aria-expanded={open}
              aria-controls={`${id}-${group.id}`}
              onClick={() => setExpanded({ ...expanded, [group.id]: !open })}
            >
              {group.label}
              <span aria-hidden="true">{open ? "−" : "+"}</span>
            </button>
            <ul id={`${id}-${group.id}`} hidden={!open} className="admin-nav-items">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => onNavigate?.()}
                    aria-current={active === item.href ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function AdminShell({
  groups,
  showHome,
  children,
  search,
  theme,
  account,
}: {
  groups: AdminNavGroup[];
  showHome: boolean;
  children: ReactNode;
  search: ReactNode;
  theme: ReactNode;
  account: ReactNode;
}) {
  const pathname = usePathname();
  const drawer = useRef<HTMLDialogElement>(null);
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    function dismissAccount(event: PointerEvent) {
      if (event.target instanceof Node && !accountMenu.current?.contains(event.target)) {
        accountMenu.current?.removeAttribute("open");
      }
    }
    function closeAccount(event: KeyboardEvent) {
      if (
        event.key === "Escape" &&
        accountMenu.current?.open &&
        accountMenu.current.contains(document.activeElement)
      ) {
        accountMenu.current.open = false;
        accountMenu.current.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", dismissAccount);
    document.addEventListener("keydown", closeAccount);
    return () => {
      document.removeEventListener("pointerdown", dismissAccount);
      document.removeEventListener("keydown", closeAccount);
    };
  }, []);
  function closeMenu() {
    drawer.current?.close();
  }
  useEffect(() => {
    if (pathname) {
      drawer.current?.close();
      accountMenu.current?.removeAttribute("open");
    }
  }, [pathname]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) drawer.current?.close();
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  return (
    <AdminFormDrafts>
      <div className="admin-shell">
        <a href="#admin-content" className="admin-skip-link">
          {t("T-1404")}
        </a>
        <div className="admin-sidebar">
          <Link href="/admin" className="admin-brand">
            <LogoOE height={52} />
            <span>{t("T-236")}</span>
          </Link>
          <Navigation key={pathname} groups={groups} showHome={showHome} />
        </div>
        <div className="admin-workspace">
          <header className="admin-topbar">
            <button
              type="button"
              className="admin-menu-button"
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              onClick={() => {
                drawer.current?.showModal();
                setMenuOpen(true);
              }}
            >
              <svg
                aria-hidden="true"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              {t("T-1402")}
            </button>
            <span className="admin-topbar-label">{t("T-236")}</span>
            <div className="admin-utilities">
              <AreaSwitch to="member" />
              {search}
              {theme}
              <details className="admin-account" ref={accountMenu}>
                <summary>
                  {t("T-1403")}
                  <span aria-hidden="true">⌄</span>
                </summary>
                <div className="admin-account-menu">{account}</div>
              </details>
            </div>
          </header>
          <main id="admin-content" tabIndex={-1} className="admin-content">
            {children}
          </main>
        </div>
        <dialog
          ref={drawer}
          className="admin-drawer"
          aria-labelledby="admin-menu-title"
          onClose={() => setMenuOpen(false)}
        >
          <header className="admin-drawer-header">
            <span id="admin-menu-title">{t("T-236")}</span>
            <button type="button" onClick={closeMenu}>
              {t("T-291")}
            </button>
          </header>
          <Navigation key={pathname} groups={groups} showHome={showHome} onNavigate={closeMenu} />
        </dialog>
      </div>
    </AdminFormDrafts>
  );
}
