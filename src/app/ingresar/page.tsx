import type { Metadata } from "next";
import Link from "next/link";
import { LogoOE } from "@/shared/brand";
import { t, tList } from "@/shared/copy";

export const metadata: Metadata = { title: t("T-040") };

// Cascarón de /ingresar: el formulario de OTP llega con el T4.
export default function IngresarPage() {
  const [inicio] = tList("T-038");
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-12">
      <Link href="/" className="self-start text-titulo" aria-label={inicio}>
        <LogoOE height={88} />
      </Link>
      <div className="flex flex-col gap-3">
        <h1 className="text-display-lg">{t("T-040")}</h1>
        <p className="text-lg">{t("T-041")}</p>
      </div>
    </main>
  );
}
