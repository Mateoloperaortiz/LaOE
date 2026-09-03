import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // T-001
  title: "Organización Estudiantil EAFIT",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-CO" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
