import type { Metadata } from "next";
import Link from "next/link";
import { MEDIA_LIMITS, PHOTO_MAX_BYTES } from "@/modules/content";
import { describeUserAgent, listSessionsFor, requireActor } from "@/modules/identity";
import { SessionsPanel } from "@/modules/identity/components/SessionsPanel";
import { CONSENT_PURPOSES, getPersonRecord, listConsents } from "@/modules/people";
import { PhotoUploader } from "@/modules/people/components/PhotoUploader";
import { requireConfig } from "@/modules/system";
import { BarraTitulo, Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDate, formatDateTime } from "@/shared/lib/dates";
import {
  consentAction,
  requestDeletionAction,
  setPhotoAction,
  updateContactAction,
} from "./actions";

// Ajustes (06-mapa-del-sitio.md): una sola página con las cinco secciones de T-133 como anclas.

const SECCIONES = [
  "mis-datos",
  "notificaciones",
  "sesiones",
  "consentimientos",
  "privacidad",
] as const;
const CONSENT_TEXTS = ["T-150", "T-151", "T-152", "T-153"] as const;
const inputClass =
  "w-full max-w-md rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";

export const metadata: Metadata = { title: t("T-418") };

export default async function AjustesPage({ searchParams }: PageProps<"/app/ajustes">) {
  const actor = await requireActor("/app/ajustes");
  const params = await searchParams;
  const guardado = typeof params.guardado === "string" ? params.guardado : "";
  const error = typeof params.error === "string" ? params.error : "";
  const confirmar = params.confirmar === "1";
  const [who, consents, sessions, deletionDays, policyVersion] = await Promise.all([
    getPersonRecord(actor.personId),
    listConsents(actor.personId),
    listSessionsFor(actor.personId),
    requireConfig("privacy.deletionDays"),
    requireConfig("privacy.policyVersion"),
  ]);
  const secciones = tList("T-133");
  const purposeLabels = tList("T-516");
  const [autorizar, retirar] = tList("T-413") as [string, string];
  const aviso = (seccion: string) =>
    guardado === seccion ? (
      <output className="block text-sm font-semibold text-titulo">{t("T-259")}</output>
    ) : null;
  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-4">
        <h1 className="text-display-lg">{t("T-418")}</h1>
        <nav aria-label={t("T-418")} className="flex flex-wrap gap-2">
          {SECCIONES.map((id, index) => (
            <a key={id} href={`#${id}`} className="rounded-full bg-fondo-suave px-3 py-1 text-sm">
              {secciones[index]}
            </a>
          ))}
        </nav>
      </header>

      <section id="mis-datos" aria-labelledby="mis-datos-titulo" className="flex flex-col gap-6">
        <BarraTitulo color="azul" className="self-start">
          <span id="mis-datos-titulo">{secciones[0]}</span>
        </BarraTitulo>
        <p className="max-w-prose">{t("T-134")}</p>
        <PhotoUploader
          currentAssetId={who?.photoAssetId ?? null}
          allowedTypes={[...MEDIA_LIMITS.types]}
          maxBytes={PHOTO_MAX_BYTES}
          labels={{
            field: t("T-403"),
            button: t("T-407"),
            help: t("T-408"),
            remove: t("T-409"),
            uploading: t("T-359"),
            done: t("T-360"),
            errorFile: t("T-419"),
            errorUpload: t("T-363"),
            alt: t("T-388", { nombre: actor.name }),
          }}
          onChange={setPhotoAction}
        />
        <form action={updateContactAction} className="flex max-w-md flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="eyebrow text-xs">
              {t("T-406")}
            </label>
            <input id="email" type="email" value={actor.email} readOnly className={inputClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="phone" className="eyebrow text-xs">
              {t("T-404")}
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={who?.phone ?? ""}
              autoComplete="tel"
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="personalEmail" className="eyebrow text-xs">
              {t("T-405")}
            </label>
            <input
              id="personalEmail"
              name="personalEmail"
              type="email"
              defaultValue={who?.personalEmail ?? ""}
              autoComplete="email"
              className={inputClass}
            />
          </div>
          {error && error !== "mis-datos" ? (
            <p
              role="alert"
              className="inline-block self-start rounded-lg bg-oe-orange px-2 py-1 text-sm text-oe-navy"
            >
              {error}
            </p>
          ) : null}
          <button type="submit" className="boton-primario self-start">
            {t("T-253")}
          </button>
          {aviso("mis-datos")}
        </form>
      </section>

      <section
        id="notificaciones"
        aria-labelledby="notificaciones-titulo"
        className="flex flex-col gap-6"
      >
        <BarraTitulo color="amarillo" className="self-start">
          <span id="notificaciones-titulo">{secciones[1]}</span>
        </BarraTitulo>
        <p className="max-w-prose">{t("T-240")}</p>
      </section>

      <section id="sesiones" aria-labelledby="sesiones-titulo" className="flex flex-col gap-6">
        <BarraTitulo color="naranja" className="self-start">
          <span id="sesiones-titulo">{secciones[2]}</span>
        </BarraTitulo>
        <div className="overflow-x-auto rounded-[var(--radius-cartel)] border border-borde">
          <table className="w-full text-left text-sm">
            <thead className="eyebrow bg-fondo-suave text-xs">
              <tr>
                <th scope="col" className="px-4 py-3">
                  {t("T-234")}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t("T-233")}
                </th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">{t("T-232")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((item) => {
                const device = describeUserAgent(item.userAgent);
                const nombre =
                  [device.browser, device.os].filter(Boolean).join(" en ") || t("T-234");
                return (
                  <tr key={item.id} className="border-t border-borde">
                    <td className="px-4 py-3 font-semibold">{nombre}</td>
                    <td className="px-4 py-3">{formatDateTime(item.lastSeenAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {item.id === actor.sessionId ? (
                        <Insignia fondo="amarillo">{t("T-232")}</Insignia>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <SessionsPanel
          buttonLabel={t("T-137")}
          doneMessage={t("T-235")}
          disabled={sessions.length < 2}
        />
      </section>

      <section
        id="consentimientos"
        aria-labelledby="consentimientos-titulo"
        className="flex flex-col gap-6"
      >
        <BarraTitulo color="azul" className="self-start">
          <span id="consentimientos-titulo">{secciones[3]}</span>
        </BarraTitulo>
        <ul className="flex list-none flex-col gap-4 p-0">
          {consents.map((state) => {
            const index = CONSENT_PURPOSES.indexOf(state.purpose);
            const texto = CONSENT_TEXTS[index] ?? "T-150";
            return (
              <li
                key={state.purpose}
                className="flex flex-col gap-3 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-5"
              >
                <h3 className="text-display-md">{purposeLabels[index] ?? state.purpose}</h3>
                <p className="max-w-prose text-sm">
                  {t(texto, { v: policyVersion, versión: policyVersion })}
                </p>
                <p className="text-sm font-semibold">
                  {state.live
                    ? t("T-411", {
                        fecha: formatDate(state.live.acceptedAt),
                        v: state.live.policyVersion,
                      })
                    : t("T-412")}
                </p>
                {state.purpose === "MEMBERSHIP" ? (
                  <p className="max-w-prose text-sm text-tinta-suave">{t("T-414")}</p>
                ) : (
                  <form action={consentAction}>
                    <input type="hidden" name="purpose" value={state.purpose} />
                    <input type="hidden" name="intent" value={state.live ? "revoke" : "grant"} />
                    <button
                      type="submit"
                      className={state.live ? "boton-secundario text-sm" : "boton-primario text-sm"}
                    >
                      {state.live ? retirar : autorizar}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
        {aviso("consentimientos")}
      </section>

      <section id="privacidad" aria-labelledby="privacidad-titulo" className="flex flex-col gap-6">
        <BarraTitulo color="sky" className="self-start">
          <span id="privacidad-titulo">{secciones[4]}</span>
        </BarraTitulo>
        <a href="/api/mis-datos" download className="boton-secundario self-start">
          {t("T-135")}
        </a>
        {who?.deletionRequestedAt ? (
          <p className="max-w-prose font-semibold">
            {t("T-416", { fecha: formatDate(who.deletionRequestedAt), n: deletionDays })}
          </p>
        ) : confirmar ? (
          <form action={requestDeletionAction} className="flex flex-col gap-4">
            <p className="max-w-prose">{t("T-415")}</p>
            <div className="flex flex-wrap gap-3">
              <button type="submit" className="boton-primario">
                {t("T-417")}
              </button>
              <Link href="/app/ajustes#privacidad" className="boton-secundario">
                {t("T-254")}
              </Link>
            </div>
          </form>
        ) : (
          <Link href="/app/ajustes?confirmar=1#privacidad" className="boton-secundario self-start">
            {t("T-136")}
          </Link>
        )}
        {aviso("privacidad")}
      </section>
    </div>
  );
}
