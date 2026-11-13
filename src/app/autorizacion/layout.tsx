import type { ReactNode } from "react";
import { AccessFrame } from "../_ui/AccessFrame";

// Pantalla de acceso: lleva el marco de la capa funcional (ADR-188).
export default function Layout({ children }: { children: ReactNode }) {
  return <AccessFrame>{children}</AccessFrame>;
}
