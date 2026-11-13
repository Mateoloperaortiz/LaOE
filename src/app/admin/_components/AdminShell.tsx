"use client";

import { usePathname } from "next/navigation";
import {
  type ComponentType,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AdminFormDrafts } from "@/shared/admin-kit/AdminFormDrafts";
import {
  type AdminNavGroup,
  type AdminSpaceIcon,
  activeAdminHref,
} from "@/shared/admin-kit/navigation";
import { t, tList } from "@/shared/copy/client";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { AreaSwitch } from "@/shared/ui/AreaSwitch";
import { AdjustmentsIcon } from "@/shared/ui/icons/AdjustmentsIcon";
import { BriefcaseIcon } from "@/shared/ui/icons/BriefcaseIcon";
import { ChevronDownIcon } from "@/shared/ui/icons/ChevronDownIcon";
import { ChevronRightIcon } from "@/shared/ui/icons/ChevronRightIcon";
import { ClipboardCheckIcon } from "@/shared/ui/icons/ClipboardCheckIcon";
import { FlagIcon } from "@/shared/ui/icons/FlagIcon";
import type { IconProps } from "@/shared/ui/icons/Glyph";
import { HomeIcon } from "@/shared/ui/icons/HomeIcon";
import { InboxIcon } from "@/shared/ui/icons/InboxIcon";
import { LayoutSidebarLeftCollapseIcon } from "@/shared/ui/icons/LayoutSidebarLeftCollapseIcon";
import { LayoutSidebarLeftExpandIcon } from "@/shared/ui/icons/LayoutSidebarLeftExpandIcon";
import { Menu2Icon } from "@/shared/ui/icons/Menu2Icon";
import { MessageIcon } from "@/shared/ui/icons/MessageIcon";
import { StarIcon } from "@/shared/ui/icons/StarIcon";
import { UserCircleIcon } from "@/shared/ui/icons/UserCircleIcon";
import { UserPlusIcon } from "@/shared/ui/icons/UserPlusIcon";
import { UsersGroupIcon } from "@/shared/ui/icons/UsersGroupIcon";
import { UsersIcon } from "@/shared/ui/icons/UsersIcon";
import { WalletIcon } from "@/shared/ui/icons/WalletIcon";

// El marco de la Operación (ADR-159 regla 2, con el aspecto de ADR-163 regla 9; rama feat/rediseno).
// - Desde 1280 px la barra lateral mide 240 px y se recoge a 64 a pedido de la persona; entre 1024 y
//   1279 px es un riel de iconos; por debajo no hay barra y el menú vive en el cajón.
// - En el riel, cada espacio abre el cajón con el menú completo, abierto en ese espacio.
// - Arriba de los espacios va la Mesa, para todos los roles, y su contador en la barra superior.
// - La barra se recoge por persona y por navegador (`localStorage`): es una comodidad, no un dato.

const SPACE_ICONS: Record<AdminSpaceIcon, ComponentType<IconProps>> = {
  personas: UsersIcon,
  comites: UsersGroupIcon,
  admision: UserPlusIcon,
  comunicacion: MessageIcon,
  participacion: StarIcon,
  permanencia: ClipboardCheckIcon,
  finanzas: WalletIcon,
  macroeventos: FlagIcon,
  junta: BriefcaseIcon,
  sistema: AdjustmentsIcon,
};

const COLLAPSED_KEY = "oe.operacion.barra";
const MID_WIDTH = "(min-width: 64rem) and (max-width: 79.999rem)";

function subscribeMidWidth(onChange: () => void): () => void {
  const query = window.matchMedia(MID_WIDTH);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "recogida";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    if (collapsed) window.localStorage.setItem(COLLAPSED_KEY, "recogida");
    else window.localStorage.removeItem(COLLAPSED_KEY);
  } catch {
    // Sin almacenamiento, la barra solo vuelve a abrirse al recargar.
  }
}

function Navigation({
  groups,
  showHome,
  rail = false,
  initialOpen,
  onOpenSpace,
  onNavigate,
}: {
  groups: AdminNavGroup[];
  showHome: boolean;
  /** En el riel, un espacio no se despliega: abre el cajón en ese espacio. */
  rail?: boolean;
  initialOpen?: string | null;
  onOpenSpace?: (id: string) => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const id = useId();
  const active = activeAdminHref(pathname, [
    ...(showHome ? ["/admin"] : []),
    "/admin/mesa",
    ...groups.flatMap((group) => group.items.map((item) => item.href)),
  ]);
  const activeGroup = groups.find((group) => group.items.some((item) => item.href === active))?.id;
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    initialOpen ? { [initialOpen]: true } : {},
  );
  return (
    <nav aria-label={t("T-236")} className="admin-navigation">
      {showHome ? (
        <Link
          href="/admin"
          onClick={() => onNavigate?.()}
          aria-current={active === "/admin" ? "page" : undefined}
          className="admin-nav-link"
        >
          <span className="admin-nav-icon">
            <HomeIcon size={18} />
          </span>
          <span className="admin-nav-label">{t("T-1401")}</span>
        </Link>
      ) : null}
      <Link
        href="/admin/mesa"
        onClick={() => onNavigate?.()}
        aria-current={active === "/admin/mesa" ? "page" : undefined}
        className="admin-nav-link"
      >
        <span className="admin-nav-icon">
          <InboxIcon size={18} />
        </span>
        <span className="admin-nav-label">{t("T-4864")}</span>
      </Link>
      <p className="admin-nav-section">{t("T-4861")}</p>
      {groups.map((group) => {
        const Icon = group.icon ? SPACE_ICONS[group.icon] : null;
        const open =
          !rail &&
          (expanded[group.id] ??
            (group.id === activeGroup || (!activeGroup && group === groups[0])));
        return (
          <div key={group.id} className="admin-nav-group">
            <button
              type="button"
              className="admin-nav-group-toggle"
              data-active={group.id === activeGroup ? "true" : undefined}
              aria-expanded={rail ? undefined : open}
              aria-controls={rail ? undefined : `${id}-${group.id}`}
              aria-haspopup={rail ? "dialog" : undefined}
              title={rail ? group.label : undefined}
              onClick={() =>
                rail ? onOpenSpace?.(group.id) : setExpanded({ ...expanded, [group.id]: !open })
              }
            >
              {Icon ? (
                <span className="admin-nav-icon">
                  <Icon size={18} />
                </span>
              ) : null}
              <span className="admin-nav-label">{group.label}</span>
              <span className="admin-nav-chevron">
                <ChevronRightIcon size={14} />
              </span>
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
  desk,
  search,
  theme,
  account,
}: {
  groups: AdminNavGroup[];
  showHome: boolean;
  children: ReactNode;
  /** El contador de la Mesa, que llega en streaming desde el servidor. */
  desk: ReactNode;
  search: ReactNode;
  theme: ReactNode;
  account: ReactNode;
}) {
  const pathname = usePathname();
  const drawer = useRef<HTMLDialogElement>(null);
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerSpace, setDrawerSpace] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const midWidth = useSyncExternalStore(
    subscribeMidWidth,
    () => window.matchMedia(MID_WIDTH).matches,
    () => false,
  );
  const rail = collapsed || midWidth;
  const [recoger, mostrar] = tList("T-4862");

  useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);
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
  function openDrawer(space: string | null) {
    setDrawerSpace(space);
    drawer.current?.showModal();
    setMenuOpen(true);
  }
  function closeMenu() {
    drawer.current?.close();
  }
  useEffect(() => {
    if (pathname) {
      drawer.current?.close();
      accountMenu.current?.removeAttribute("open");
    }
  }, [pathname]);

  return (
    <AdminFormDrafts>
      <div
        className="admin-shell fondo-sobrio"
        data-densidad="escritorio"
        data-capa="funcional"
        data-barra={collapsed ? "recogida" : undefined}
      >
        <a href="#admin-content" className="admin-skip-link">
          {t("T-1404")}
        </a>
        <aside className="admin-sidebar">
          <div className="admin-brand">
            <Link href="/admin" className="admin-brand-name">
              <strong>{t("T-236")}</strong>
              <span>{t("T-4863")}</span>
            </Link>
            <button
              type="button"
              className="admin-collapse"
              aria-label={collapsed ? mostrar : recoger}
              title={collapsed ? mostrar : recoger}
              onClick={() => {
                writeCollapsed(!collapsed);
                setCollapsed(!collapsed);
              }}
            >
              {collapsed ? (
                <LayoutSidebarLeftExpandIcon size={18} />
              ) : (
                <LayoutSidebarLeftCollapseIcon size={18} />
              )}
            </button>
          </div>
          <Navigation
            key={pathname}
            groups={groups}
            showHome={showHome}
            rail={rail}
            onOpenSpace={(space) => openDrawer(space)}
          />
        </aside>
        <div className="admin-workspace">
          <header className="admin-topbar">
            <button
              type="button"
              className="admin-menu-button"
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              onClick={() => openDrawer(null)}
            >
              <Menu2Icon size={18} />
              {t("T-1402")}
            </button>
            <span className="admin-topbar-label">{t("T-236")}</span>
            <div className="admin-utilities">
              {desk}
              <AreaSwitch to="member" />
              {search}
              {theme}
              <details className="admin-account" ref={accountMenu}>
                <summary>
                  <UserCircleIcon size={18} className="admin-account-icon" />
                  <span className="admin-account-label">{t("T-1403")}</span>
                  <ChevronDownIcon />
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
          className="admin-drawer fondo-sobrio"
          aria-labelledby="admin-menu-title"
          onClose={() => setMenuOpen(false)}
        >
          <header className="admin-drawer-header">
            <span id="admin-menu-title">{t("T-236")}</span>
            <button type="button" onClick={closeMenu}>
              {t("T-291")}
            </button>
          </header>
          {menuOpen ? (
            <Navigation
              key={`${pathname}-${drawerSpace ?? ""}`}
              groups={groups}
              showHome={showHome}
              initialOpen={drawerSpace}
              onNavigate={closeMenu}
            />
          ) : null}
        </dialog>
      </div>
    </AdminFormDrafts>
  );
}
