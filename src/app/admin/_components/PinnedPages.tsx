"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import {
  addRecent,
  FAVORITES_KEY,
  labelFromTitle,
  type PinnedPage,
  parsePinned,
  pinnableHref,
  RECENTS_KEY,
  toggleFavorite,
} from "@/shared/admin-kit/pinned-pages";
import { tList } from "@/shared/copy/client";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { StarFilledIcon } from "@/shared/ui/icons/StarFilledIcon";
import { StarIcon } from "@/shared/ui/icons/StarIcon";

// Favoritos y Recientes de la Operación (ADR-167 regla 3): la estrella de la barra superior fija la
// pantalla que se mira, con sus filtros, y la barra lateral muestra lo fijado y las últimas visitas.
// Viven en el navegador: si no hay almacenamiento, no aparecen y nada más cambia.

const CHANGE = "oe-operacion-fijadas";
const ALWAYS_THERE = new Set(["/admin", "/admin/mesa"]);

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, list: PinnedPage[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
    window.dispatchEvent(new Event(CHANGE));
  } catch {
    // Sin almacenamiento no hay favoritos: la pantalla sigue igual.
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function useStored(key: string): PinnedPage[] {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  return parsePinned(raw);
}

function currentPage(): PinnedPage {
  return {
    href: pinnableHref(window.location.pathname, window.location.search),
    label: labelFromTitle(document.title),
  };
}

/** Anota la visita en Recientes cuando cambia la pantalla, con el título que ya puso la página. */
export function RecentTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || ALWAYS_THERE.has(pathname)) return;
    const timer = window.setTimeout(() => {
      write(RECENTS_KEY, addRecent(parsePinned(read(RECENTS_KEY)), currentPage()));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [pathname]);
  return null;
}

/** La estrella de la barra superior: fija o suelta la pantalla actual, con sus filtros. */
export function FavoriteToggle() {
  const favorites = useStored(FAVORITES_KEY);
  const pathname = usePathname();
  const search = useSearchParams();
  const [fijar, soltar] = tList("T-4898");
  if (!pathname || ALWAYS_THERE.has(pathname)) return null;
  const href = pinnableHref(pathname, search.toString());
  const pinned = favorites.some((item) => item.href === href);
  const label = pinned ? soltar : fijar;
  return (
    <button
      type="button"
      className="admin-favorite"
      aria-pressed={pinned}
      aria-label={label}
      title={label}
      onClick={() =>
        write(
          FAVORITES_KEY,
          toggleFavorite(favorites, { href, label: labelFromTitle(document.title) }),
        )
      }
    >
      {pinned ? <StarFilledIcon size={18} /> : <StarIcon size={18} />}
    </button>
  );
}

/** Las dos listas de la barra lateral; una lista vacía no se muestra. */
export function PinnedLists({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const favorites = useStored(FAVORITES_KEY);
  const pathname = usePathname();
  // Recientes no repite lo fijado ni la pantalla en la que ya se está.
  const recents = useStored(RECENTS_KEY).filter(
    (item) =>
      !favorites.some((favorite) => favorite.href === item.href) &&
      item.href.split("?")[0] !== pathname,
  );
  const [, , favoritosTitulo, recientesTitulo] = tList("T-4898");
  return (
    <>
      {[
        { title: favoritosTitulo, items: favorites, kind: "favoritos" },
        { title: recientesTitulo, items: recents, kind: "recientes" },
      ].map((list) =>
        list.items.length > 0 ? (
          <div key={list.kind} className="admin-pinned" data-lista={list.kind}>
            <p className="admin-nav-section">{list.title}</p>
            <ul className="admin-nav-items">
              {list.items.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} onClick={() => onNavigate?.()}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </>
  );
}
