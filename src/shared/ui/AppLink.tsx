"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentPropsWithRef } from "react";
import { preservePageScroll } from "@/shared/lib/navigation-scroll";

/** Cambiar la vista de una página conserva el lugar; un destino distinto navega normalmente. */
export function AppLink({ href, scroll, ...props }: ComponentPropsWithRef<typeof NextLink>) {
  const pathname = usePathname();
  const origin = typeof window === "undefined" ? undefined : window.location.origin;
  return (
    <NextLink
      {...props}
      href={href}
      scroll={scroll ?? !preservePageScroll(href, pathname, origin)}
    />
  );
}

/** El contenido editable conserva sus enlaces nativos; sólo una consulta local usa el router. */
export function ContentLink({
  href,
  onClick,
  onMouseEnter,
  onTouchStart,
  ...props
}: ComponentPropsWithRef<"a">) {
  const pathname = usePathname();
  const origin = typeof window === "undefined" ? undefined : window.location.origin;
  if (href !== undefined && preservePageScroll(href, pathname, origin)) {
    return (
      <AppLink
        {...props}
        {...(onClick ? { onClick } : {})}
        {...(onMouseEnter ? { onMouseEnter } : {})}
        {...(onTouchStart ? { onTouchStart } : {})}
        href={href}
        prefetch={false}
      />
    );
  }
  return (
    <a
      {...props}
      href={href}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onTouchStart={onTouchStart}
    />
  );
}
