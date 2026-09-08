"use client";

import type { ReactNode } from "react";

export function AppleWalletLink({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <a
      href="/api/wallet/apple"
      target="_blank"
      rel="noopener"
      className={className}
      onClick={(event) => {
        const nav = navigator as Navigator & { standalone?: boolean };
        const standalone =
          window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
        // ADR-040: evita la ventana secundaria que quedó en blanco en la PWA de iPhone.
        // Se conserva la navegación nativa y el gesto del usuario, sin fetch ni blob.
        event.currentTarget.target = standalone ? "_self" : "_blank";
      }}
    >
      {children}
    </a>
  );
}
