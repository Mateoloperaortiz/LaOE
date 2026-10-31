import type { LinkProps } from "next/link";

/** Una consulta local actualiza la vista; una ruta o ancla nueva mantiene su navegación. */
export function preservePageScroll(
  href: LinkProps["href"],
  pathname: string | null,
  origin = "https://navigation.invalid",
): boolean {
  if (!pathname) return false;
  if (typeof href !== "string") {
    if (href.protocol || href.host || href.hostname || href.auth || href.hash) return false;
    href = href.pathname ?? "";
  }
  // También un # vacío es una petición explícita de ir al inicio de la página.
  if (href.includes("#")) return false;
  try {
    const current = new URL(pathname, origin);
    const destination = new URL(href, current);
    return destination.origin === current.origin && destination.pathname === current.pathname;
  } catch {
    return false;
  }
}
