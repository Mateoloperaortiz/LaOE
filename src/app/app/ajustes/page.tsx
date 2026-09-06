import type { Metadata } from "next";
import Link from "next/link";
import { getEnv } from "@/env";
import { getPreferences, listSubscriptionsFor } from "@/modules/comms";
import { DeviceMark } from "@/modules/comms/components/DeviceMark";
import { NotificationsPanel } from "@/modules/comms/components/NotificationsPanel";
import { MEDIA_LIMITS, PHOTO_MAX_BYTES } from "@/modules/content";
import {
  describeUserAgent,
  getOrCreateCalendarToken,
  listSessionsFor,
  requireActor,
} from "@/modules/identity";
import { CalendarLink } from "@/modules/identity/components/CalendarLink";
import { SessionsPanel } from "@/modules/identity/components/SessionsPanel";
import {
  CONSENT_PURPOSES,
  getPersonRecord,
  listConsents,
  SELF_MANAGED_PURPOSES,
} from "@/modules/people";
import { PhotoUploader } from "@/modules/people/components/PhotoUploader";
import { requireConfig } from "@/modules/system";
import { BarraTitulo, Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDate, formatDateTime } from "@/shared/lib/dates";
import {
  consentAction,
  removeDeviceAction,
  requestDeletionAction,
  rotateCalendarAction,
  setPhotoAction,
  updateContactAction,
  updatePreferencesAction,
} from "./actions";

// Ajustes (06-mapa-del-sitio.md): una sola página con las seis secciones de T-133 como anclas.

const SECCIONES = [
  "mis-datos",
  "notificaciones",
  "calendario",
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
  const [who, consents, sessions, deletionDays, policyVersion, devices, preferences] =
    await Promise.all([
      getPersonRecord(actor.personId),
      listConsents(actor.personId),
      listSessionsFor(actor.personId),
      requireConfig("privacy.deletionDays"),
      requireConfig("privacy.policyVersion"),
      listSubscriptionsFor(actor.personId),
      getPreferences(actor.personId),
    ]);
  const vapidPublicKey = getEnv().VAPID_PUBLIC_KEY ?? null;
  const calendarUrl = `${getEnv().APP_URL.replace(/\/$/, "")}/api/ics/mi-agenda.ics?t=${await getOrCreateCalendarToken(actor.personId)}`;
  const [colDispositivo, colDesde, colUltimoUso] = tList("T-1076");
  const [prefAnuncios, prefPuntos, prefRecordatorios, prefCampañas] = tList("T-1080");
  const preferencias = [
    { name: "pushAnnouncements", label: prefAnuncios, checked: preferences.pushAnnouncements },
    { name: "pushPoints", label: prefPuntos, checked: preferences.pushPoints },
    { name: "pushReminders", label: prefRecordatorios, checked: preferences.pushReminders },
    { name: "emailCampaigns", label: prefCampañas, checked: preferences.emailCampaigns },
  ];
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
        <p className="max-w-prose">{t("T-1063")}</p>
        <NotificationsPanel
          vapidPublicKey={vapidPublicKey}
          labels={{
            enable: t("T-1064"),
            disable: t("T-1066"),
            enabled: t("T-1065"),
            enabledNow: t("T-1108"),
            blocked: t("T-1067"),
            unsupported: t("T-1068"),
            notConfigured: t("T-1069"),
            iosInstall: t("T-1070"),
            install: t("T-1071"),
            installed: t("T-1072"),
            installHint: t("T-1073"),
            failed: t("T-1109"),
          }}
        />
        <h3 className="text-display-md">{t("T-1074")}</h3>
        {devices.length === 0 ? (
          <p className="max-w-prose text-tinta-suave">{t("T-1075")}</p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-cartel)] border border-borde">
            <table className="w-full text-left text-sm">
              <thead className="eyebrow bg-fondo-suave text-xs">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    {colDispositivo}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {colDesde}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {colUltimoUso}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">{t("T-1077")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => {
                  const desc = describeUserAgent(device.userAgent);
                  const nombre =
                    [desc.browser, desc.os].filter(Boolean).join(" en ") || colDispositivo;
                  return (
                    <tr key={device.id} className="border-t border-borde">
                      <td className="px-4 py-3 font-semibold">
                        <span className="flex flex-wrap items-center gap-2">
                          {nombre}
                          <DeviceMark endpoint={device.endpoint} label={t("T-1078")} />
                        </span>
                      </td>
                      <td className="px-4 py-3">{formatDate(device.createdAt)}</td>
                      <td className="px-4 py-3">{formatDateTime(device.lastSeenAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <form action={removeDeviceAction}>
                          <input type="hidden" name="id" value={device.id} />
                          <button type="submit" className="boton-secundario text-sm">
                            {t("T-1077")}
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {guardado === "dispositivo" ? (
          <output className="block text-sm font-semibold text-titulo">{t("T-1110")}</output>
        ) : null}
        <h3 className="text-display-md">{t("T-1079")}</h3>
        <form action={updatePreferencesAction} className="flex max-w-md flex-col gap-4">
          <ul className="flex list-none flex-col gap-3 p-0">
            {preferencias.map((item) => (
              <li key={item.name} className="flex items-start gap-3">
                <input
                  id={`pref-${item.name}`}
                  name={item.name}
                  type="checkbox"
                  defaultChecked={item.checked}
                  className="mt-1 size-5 accent-oe-navy"
                />
                <label htmlFor={`pref-${item.name}`} className="font-semibold">
                  {item.label}
                </label>
              </li>
            ))}
          </ul>
          <p className="max-w-prose text-sm text-tinta-suave">{t("T-1081")}</p>
          <button type="submit" className="boton-primario self-start">
            {t("T-1083")}
          </button>
          {guardado === "notificaciones" ? (
            <output className="block text-sm font-semibold text-titulo">{t("T-1082")}</output>
          ) : null}
        </form>
      </section>

      <section id="calendario" aria-labelledby="calendario-titulo" className="flex flex-col gap-6">
        <BarraTitulo color="sky" className="self-start">
          <span id="calendario-titulo">{secciones[2]}</span>
        </BarraTitulo>
        <p className="max-w-prose">{t("T-1084")}</p>
        <CalendarLink
          url={calendarUrl}
          labels={{
            field: t("T-1085"),
            copy: t("T-1086"),
            copied: t("T-1087"),
            open: t("T-1088"),
          }}
        />
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-1091")}</p>
        <form action={rotateCalendarAction} className="flex flex-col items-start gap-3">
          <button type="submit" className="boton-secundario text-sm">
            {t("T-1089")}
          </button>
          {guardado === "calendario" ? (
            <output className="block text-sm font-semibold text-titulo">{t("T-1090")}</output>
          ) : null}
        </form>
      </section>

      <section id="sesiones" aria-labelledby="sesiones-titulo" className="flex flex-col gap-6">
        <BarraTitulo color="naranja" className="self-start">
          <span id="sesiones-titulo">{secciones[3]}</span>
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
          <span id="consentimientos-titulo">{secciones[4]}</span>
        </BarraTitulo>
        <ul className="flex list-none flex-col gap-4 p-0">
          {consents
            .filter((state) => SELF_MANAGED_PURPOSES.includes(state.purpose))
            .map((state) => {
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
                        className={
                          state.live ? "boton-secundario text-sm" : "boton-primario text-sm"
                        }
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
          <span id="privacidad-titulo">{secciones[5]}</span>
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
