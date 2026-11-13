import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicCredential } from "@/modules/crm";
import { SelloOE } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";
import { Afiche } from "../../_ui/Afiche";

// La página pública de una credencial (ADR-171 regla 3): solo lo que la persona publicó, sin enlaces a
// nada más de la casa, y fuera de los buscadores. Una credencial revocada lo dice y no muestra nada más.

export const metadata: Metadata = {
  title: tList("T-4951")[0] ?? "",
  robots: { index: false, follow: false },
};

const PUBLIC_ID = /^[A-Za-z0-9_-]{16,64}$/;

export default async function VerificarPage({ params }: PageProps<"/verificar/[id]">) {
  const { id } = await params;
  const found = PUBLIC_ID.test(id) ? await getPublicCredential(id) : null;
  if (!found) notFound();
  const [titulo, semestre, emitidaPor, publicadaEl, comprobacion] = tList("T-4951");
  if (found.revoked) {
    return (
      <>
        <Afiche variante="paper" titulo={titulo} />
        <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-8 sm:py-12">
          <p>{t("T-4952")}</p>
        </div>
      </>
    );
  }
  return (
    <>
      <Afiche variante="navy" eyebrow={<span>{titulo}</span>} titulo={found.personName} />
      <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8 sm:py-12">
        <p className="text-xl font-semibold">{found.title}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="font-semibold">{semestre}</dt>
          <dd>{found.termCode}</dd>
          <dt className="font-semibold">{emitidaPor}</dt>
          <dd>{t("T-001")}</dd>
          <dt className="font-semibold">{publicadaEl}</dt>
          <dd>{formatDate(found.publishedAt)}</dd>
        </dl>
        <p className="text-sm text-tinta-suave">{comprobacion}</p>
        <SelloOE tamano="md" />
      </div>
    </>
  );
}
