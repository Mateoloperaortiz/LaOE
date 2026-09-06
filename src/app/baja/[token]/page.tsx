import type { Metadata } from "next";
import Link from "next/link";
import { unsubscribeTokenExists } from "@/modules/comms";
import { LogoOE } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { unsubscribeAction } from "./actions";

// Dejar de recibir campañas (ADR-038 regla 8): página pública que llega desde el pie del correo. El
// token identifica a la persona; confirmar apaga solo las campañas por correo.

export const metadata: Metadata = { title: t("T-1103"), robots: { index: false } };

const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

export default async function BajaPage({ params, searchParams }: PageProps<"/baja/[token]">) {
  const { token } = await params;
  const search = await searchParams;
  const estado = typeof search.estado === "string" ? search.estado : "";
  const valido =
    TOKEN.test(token) && estado !== "invalido" && (await unsubscribeTokenExists(token));
  const [inicio] = tList("T-038");
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-12">
      <Link href="/" className="self-start text-titulo" aria-label={inicio}>
        <LogoOE height={88} />
      </Link>
      <div className="flex flex-col gap-4">
        <h1 className="text-display-lg">{t("T-1103")}</h1>
        {!valido ? (
          <p className="rounded-xl bg-oe-orange px-4 py-3 font-semibold text-oe-navy">
            {t("T-1107")}
          </p>
        ) : estado === "listo" ? (
          <output className="block rounded-xl bg-oe-yellow-soft px-4 py-3 font-semibold text-oe-navy">
            {t("T-1106")}
          </output>
        ) : (
          <form action={unsubscribeAction} className="flex flex-col gap-4">
            <input type="hidden" name="token" value={token} />
            <p className="max-w-prose">{t("T-1104")}</p>
            <button type="submit" className="boton-primario self-start">
              {t("T-1105")}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
