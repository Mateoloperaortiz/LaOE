import type { Metadata } from "next";
import QRCode from "qrcode";
import { issueCarnet, requireActor } from "@/modules/identity";
import { getMyMembership, getPersonRecord } from "@/modules/people";
import { Cartel } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { cargoEnComite } from "../_ui/PersonaTarjeta";

// Carnet (ADR-034 regla 10): un QR con el token firmado de 24 horas dentro de un cartel con el
// nombre, los comités con cargo y el semestre (T-220). La consola anfitrión de la fase 3 lo lee.

export const metadata: Metadata = { title: t("T-131") };

export default async function CarnetPage() {
  const actor = await requireActor("/app/carnet");
  const [mine, who] = await Promise.all([
    getMyMembership(actor.personId),
    getPersonRecord(actor.personId),
  ]);
  const carnet = issueCarnet(actor.personId);
  const svg = await QRCode.toString(carnet.token, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });
  const [organizacion] = tList("T-220");
  const comites = mine.committees.map((item) => cargoEnComite(item.roleLabel, item.committeeName));
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-display-lg">{t("T-131")}</h1>
        <p className="max-w-prose text-lg">{t("T-132")}</p>
      </header>
      <Cartel
        variante="navy"
        nivel="h2"
        tamano="hero"
        eyebrow={organizacion}
        titulo={who?.fullName?.trim() || actor.name}
        subtitulo={comites.length > 0 ? comites.join(" · ") : t("T-402")}
        className="max-w-2xl"
      >
        <figure
          data-token={carnet.token}
          className="mt-8 flex flex-col items-start gap-2 self-start rounded-2xl bg-white p-3 text-oe-navy"
        >
          <div
            role="img"
            aria-label={t("T-400")}
            className="size-56 [&_svg]:size-full"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG generado en servidor por `qrcode`, sin datos externos
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <figcaption className="text-sm font-semibold">
            {mine.term ? `${mine.term.code} · ` : ""}
            {t("T-401", { fecha: formatDateTime(carnet.expiresAt) })}
          </figcaption>
        </figure>
      </Cartel>
    </div>
  );
}
