import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { isDownloadPending } from "@/app/_lib/download";
import { getCarnetMetadata, issueCarnet, requireActor } from "@/modules/identity";
import { canParticipate, getMyMembership, getPersonRecord } from "@/modules/people";
import { isStalePass, listPassesFor, walletAvailability } from "@/modules/wallet";
import { AppleWalletLink } from "@/modules/wallet/components/AppleWalletLink";
import { Cartel } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { cargoEnComite } from "../_ui/PersonaTarjeta";
import { revokeCarnetAction } from "./actions";

// Carnet (ADR-034 regla 10): un QR con el token firmado de 24 horas dentro de un cartel con el
// nombre, los comités con cargo y el semestre (T-220). La consola anfitrión de la fase 3 lo lee.

export const metadata: Metadata = { title: t("T-131") };

export default async function CarnetPage({ searchParams }: PageProps<"/app/carnet">) {
  const actor = await requireActor("/app/carnet");
  if (!canParticipate(actor.membershipStatus)) {
    return (
      <div className="flex max-w-2xl flex-col items-start gap-6">
        <h1>{t("T-131")}</h1>
        <p>{t("T-2042")}</p>
        <Link href="/app" className="boton-secundario">
          {t("T-2043")}
        </Link>
      </div>
    );
  }
  const params = await searchParams;
  const saved = params.guardado === "carnet";
  const error = typeof params.error === "string" ? params.error : "";
  const descargaPendiente = isDownloadPending(params);
  const [mine, who, credential, passes] = await Promise.all([
    getMyMembership(actor.personId),
    getPersonRecord(actor.personId),
    getCarnetMetadata(actor.personId),
    listPassesFor(actor.personId),
  ]);
  const available = walletAvailability();
  const apple = passes.find((pass) => pass.platform === "APPLE");
  const google = passes.find((pass) => pass.platform === "GOOGLE");
  const appleStale = apple?.lastIssuedAt && isStalePass(apple, credential, mine.term?.id ?? null);
  const googlePending =
    google &&
    !google.revokedAt &&
    (!google.issuedAt || isStalePass(google, credential, mine.term?.id ?? null));
  const showWallet =
    available.apple || available.google || credential !== null || passes.length > 0;
  const carnet = await issueCarnet(actor.personId);
  const svg = await QRCode.toString(carnet.token, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });
  const [organizacion] = tList("T-220");
  const comites = mine.committees.map((item) => cargoEnComite(item, item.committeeName));
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
      {showWallet ? (
        <section
          id="billeteras"
          aria-labelledby="billeteras-titulo"
          className="flex max-w-2xl flex-col gap-5 border-t border-borde pt-6"
        >
          <h2 id="billeteras-titulo" className="text-display-md">
            {t("T-1189")}
          </h2>
          {available.apple || available.google ? (
            <p className="max-w-prose">{t("T-1190")}</p>
          ) : null}
          {saved ? (
            <output className="block text-sm font-semibold text-titulo">{t("T-1195")}</output>
          ) : null}
          {descargaPendiente ? (
            <output className="block text-sm font-semibold text-titulo">{t("T-3211")}</output>
          ) : null}
          {error === "google" || error === "apple" ? (
            <p role="alert" className="rounded-xl bg-oe-orange px-4 py-3 text-sm text-oe-navy">
              {t(error === "google" ? "T-1208" : "T-1216")}
            </p>
          ) : null}
          {appleStale && apple?.lastIssuedAt ? (
            <output className="block rounded-xl border border-borde bg-fondo-suave px-4 py-3 text-sm">
              {t("T-1196", { fecha: formatDateTime(apple.lastIssuedAt) })}
            </output>
          ) : null}
          {googlePending ? (
            <output className="block text-sm text-tinta-suave">{t("T-1218")}</output>
          ) : null}
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            {available.apple ? (
              <div className="flex min-w-0 flex-1 flex-col items-start gap-3">
                <AppleWalletLink className="inline-flex min-h-12 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-titulo">
                  <Image
                    src="/wallet/apple-wallet-badge.svg"
                    alt={t("T-1191")}
                    width={196}
                    height={60}
                    unoptimized
                    className="h-12 w-auto max-w-full object-contain"
                  />
                </AppleWalletLink>
                <p className="max-w-prose text-sm text-tinta-suave">{t("T-1215")}</p>
              </div>
            ) : null}
            {available.google ? (
              <div className="flex min-w-0 flex-1 flex-col items-start gap-3">
                <a
                  href="/api/wallet/google"
                  className="inline-flex min-h-12 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-titulo"
                >
                  <Image
                    src="/wallet/google-wallet-badge.svg"
                    alt={t("T-1192")}
                    width={196}
                    height={60}
                    unoptimized
                    className="h-12 w-auto max-w-full object-contain"
                  />
                </a>
                <p className="max-w-prose text-sm text-tinta-suave">{t("T-1214")}</p>
              </div>
            ) : null}
          </div>
          {credential ? (
            <details className="rounded-xl border border-borde p-4">
              <summary className="cursor-pointer font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-titulo">
                {t("T-1193")}
              </summary>
              <form action={revokeCarnetAction} className="mt-4 flex flex-col items-start gap-4">
                <input type="hidden" name="confirm" value="1" />
                <p className="max-w-prose text-sm">{t("T-1194")}</p>
                <button type="submit" className="boton-secundario text-sm">
                  {t("T-1193")}
                </button>
              </form>
            </details>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
