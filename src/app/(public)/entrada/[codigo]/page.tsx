import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getEnv } from "@/env";
import { getTicket } from "@/modules/forms";
import { t, tList } from "@/shared/copy";
import { formatDateTime, formatTime } from "@/shared/lib/dates";
import { Afiche } from "../../_ui/Afiche";

// La entrada propia de un inscrito (ADR-187): el enlace es el código, así que esta página no se
// indexa. Muestra el QR que lee la puerta y, si ya entró, a qué hora.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: tList("T-5024")[0] ?? "",
  robots: { index: false, follow: false },
};

export default async function EntradaPage({ params }: PageProps<"/entrada/[codigo]">) {
  const { codigo } = await params;
  const ticket = await getTicket(codigo);
  if (!ticket) {
    notFound();
  }
  const url = `${getEnv().APP_URL}/entrada/${codigo}`;
  const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  const [titulo, instrucciones] = tList("T-5024");
  return (
    <>
      <Afiche variante="amarillo" titulo={titulo} />
      <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
        <section className="flex flex-col gap-2">
          <p className="text-display-md">{`${ticket.eventName} · ${ticket.editionName}`}</p>
          <p className="text-lg">{ticket.name}</p>
          <p>{formatDateTime(ticket.startsAt)}</p>
          {ticket.location ? <p>{ticket.location}</p> : null}
        </section>
        {ticket.checkedInAt ? (
          <output className="block rounded-xl border border-borde bg-fondo-suave p-4 text-lg font-semibold">
            {t("T-5030", { hora: formatTime(ticket.checkedInAt) })}
          </output>
        ) : (
          <p className="text-lg">{instrucciones}</p>
        )}
        <div
          className="w-full max-w-xs self-center rounded-[var(--radius-cartel)] bg-white p-4 [&>svg]:h-auto [&>svg]:w-full"
          role="img"
          aria-label={t("T-5031")}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: el SVG lo dibuja `qrcode` en el servidor con una URL de la casa
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
      </div>
    </>
  );
}
