import type { Metadata } from "next";
import { requireActor } from "@/modules/identity";
import { type AlumniEntry, APPOINTMENT_KINDS, listAlumniByYear } from "@/modules/people";
import { Cartel, Elemento, feedVariant, Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { mediaUrl } from "@/shared/lib/media";

// Galería de egresados (ADR-030): un cartel por año de salida con los nombres y una tarjeta por persona.

export const metadata: Metadata = { title: t("T-074") };

function appointmentLabel(entry: AlumniEntry["appointments"][number]): string {
  const names = tList("T-444");
  const label = names[APPOINTMENT_KINDS.indexOf(entry.kind)] ?? entry.kind;
  return `${entry.kind === "OTHER" && entry.title ? entry.title : label} · ${entry.termCode}`;
}

export default async function EgresadosPage() {
  await requireActor("/app/egresados");
  const years = await listAlumniByYear();
  const [tituloCartel, nombres] = tList("T-222") as [string, string];
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-display-lg">{t("T-074")}</h1>
        <p className="max-w-prose text-lg">{t("T-075")}</p>
      </header>
      {years.length === 0 ? (
        <div className="flex items-center gap-6 rounded-[var(--radius-cartel)] border border-borde bg-fondo-suave p-6 textura-granito">
          <Elemento tipo="estrella" className="size-12 shrink-0 text-oe-yellow" />
          <p className="text-lg">{t("T-386")}</p>
        </div>
      ) : (
        years.map((group, index) => (
          <section
            key={group.year}
            aria-labelledby={`egresados-${group.year}`}
            className="flex flex-col gap-6"
          >
            <Cartel
              variante={feedVariant(index)}
              nivel="h2"
              titulo={
                <span id={`egresados-${group.year}`}>
                  {tituloCartel.replace("{año}", String(group.year))}
                </span>
              }
              subtitulo={nombres.replace(
                "{nombres}",
                group.entries.map((entry) => entry.fullName).join(" · "),
              )}
              elemento={<Elemento tipo="destello" className="size-16" />}
            />
            <ul className="grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {group.entries.map((entry) => (
                <li
                  key={entry.personId}
                  className="flex flex-col gap-3 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-5"
                >
                  <div className="flex items-center gap-4">
                    {entry.photoAssetId ? (
                      // biome-ignore lint/performance/noImgElement: ADR-022, los bytes no atraviesan la app
                      <img
                        src={mediaUrl(entry.photoAssetId, 480)}
                        alt={t("T-388", { nombre: entry.fullName })}
                        width={64}
                        height={64}
                        loading="lazy"
                        className="size-16 rounded-full object-cover"
                      />
                    ) : null}
                    <div className="flex flex-col">
                      <p className="text-display-md">{entry.fullName}</p>
                      {entry.fromTermCode && entry.toTermCode ? (
                        <p className="text-sm text-tinta-suave">
                          {t("T-387", { desde: entry.fromTermCode, hasta: entry.toTermCode })}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {entry.committees.length > 0 ? (
                    <ul className="flex list-none flex-wrap gap-2 p-0">
                      {entry.committees.map((item) => (
                        <li key={item}>
                          <Insignia fondo="sky">{item}</Insignia>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {entry.appointments.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      <p className="eyebrow text-xs text-tinta-suave">{t("T-374")}</p>
                      <ul className="flex list-none flex-wrap gap-2 p-0">
                        {entry.appointments.map((item) => (
                          <li key={`${item.kind}-${item.termCode}`}>
                            <Insignia fondo="amarillo">{appointmentLabel(item)}</Insignia>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
