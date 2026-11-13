import type { Metadata } from "next";
import "./presentar.css";

// Las pantallas de presentación (ADR-181): la consola de una ocasión, una asamblea o la tabla de The
// Games, en otra ventana para el proyector. Van en la capa de marca, sin el marco de la Operación ni de
// Mi OE, y cada una exige el permiso de su pantalla de siempre.

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function PresentarLayout({ children }: LayoutProps<"/presentar">) {
  return (
    <main className="presentacion" data-capa="marca">
      {children}
    </main>
  );
}
