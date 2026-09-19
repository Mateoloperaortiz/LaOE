"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { LogoOE, ThemeToggle } from "@/shared/brand";
import { t, tList } from "@/shared/copy/client";
import { Menu2Icon } from "@/shared/ui/icons/Menu2Icon";

type Destination = { name: string; href: string };

export function PublicHeader({ destinations }: { destinations: Destination[] }) {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const dialogId = useId();
  const titleId = useId();
  const themes = tList("T-034");
  const active = destinations
    .filter(({ href }) => pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  function closeMenu() {
    dialog.current?.close();
  }

  useEffect(() => {
    // También cierra al volver/avanzar en el historial mientras el menú está abierto.
    if (pathname) dialog.current?.close();
  }, [pathname]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const change = () => {
      if (desktop.matches) dialog.current?.close();
    };
    desktop.addEventListener("change", change);
    return () => desktop.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  function navigation(mobile: boolean) {
    return (
      <nav
        aria-label={t("T-1540")}
        className={mobile ? "portal-mobile-links" : "portal-desktop-links"}
      >
        {destinations.map(({ name, href }) => (
          <Link
            key={href}
            href={href}
            aria-current={href === active ? "page" : undefined}
            {...(mobile ? { onNavigate: closeMenu } : {})}
            className="portal-nav-link"
          >
            {name}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <header className="portal-header border-b border-borde">
      <div className="portal-header-inner">
        <Link href="/" className="portal-logo text-titulo" aria-label={destinations[0]?.name}>
          <LogoOE height={56} />
        </Link>
        {navigation(false)}
        <div className="portal-header-actions">
          <Link
            href="/ingresar"
            className="boton-secundario portal-member-link"
            aria-label={t("T-004")}
          >
            <span className="portal-member-short">{t("T-1549")}</span>
            <span className="portal-member-full">{t("T-004")}</span>
          </Link>
          <span className="portal-desktop-theme">
            <ThemeToggle etiquetas={themes} />
          </span>
          <button
            ref={trigger}
            type="button"
            className="boton-secundario portal-menu-trigger"
            aria-expanded={open}
            aria-controls={dialogId}
            aria-haspopup="dialog"
            onClick={() => {
              dialog.current?.showModal();
              setOpen(true);
              dialog.current?.querySelector<HTMLElement>("[aria-current='page']")?.focus();
            }}
          >
            <Menu2Icon size={20} />
            {t("T-1541")}
          </button>
        </div>
      </div>
      <dialog
        ref={dialog}
        id={dialogId}
        aria-labelledby={titleId}
        className="portal-menu textura-granito"
        onClose={() => {
          setOpen(false);
          if (trigger.current?.getClientRects().length) trigger.current.focus();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const elements = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
          );
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
        <div className="portal-menu-heading">
          <h2 id={titleId}>{t("T-1540")}</h2>
          <button type="button" className="boton-secundario" onClick={closeMenu}>
            {t("T-1542")}
          </button>
        </div>
        {navigation(true)}
        <div className="portal-menu-footer">
          <Link href="/ingresar" className="boton-secundario" onNavigate={closeMenu}>
            {t("T-004")}
          </Link>
          <ThemeToggle etiquetas={themes} />
        </div>
      </dialog>
    </header>
  );
}
