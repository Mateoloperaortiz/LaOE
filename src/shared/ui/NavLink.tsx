"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type Props = {
  href: string;
  children: ReactNode;
  className?: string;
  /** Clases que se suman cuando la ruta actual cuelga de `href` (07-marca.md §9: el activo con barra azul debajo). */
  activeClassName?: string;
};

export function NavLink({ href, children, className = "", activeClassName = "" }: Props) {
  const pathname = usePathname();
  const active =
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${className} ${active ? activeClassName : ""}`.trim()}
    >
      {children}
    </Link>
  );
}
