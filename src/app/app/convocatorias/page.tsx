import type { Metadata } from "next";
import Link from "next/link";
import { single } from "@/app/_lib/search";
import { CALL_ENTRY_STATUSES, getCall, listMyEntries, listOpenCalls } from "@/modules/crm";
import { requireActor } from "@/modules/identity";
import { listGroupIdsOf, listGroupRefs } from "@/modules/permanence";
import { getCurrentTerm } from "@/modules/terms";
import { BarraTitulo, Cartel, Insignia, SelloOE } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";
import { Vacio } from "../_ui/Vacio";

// Convocatorias en Mi OE (06-mapa-del-sitio.md, ADR-037 regla 10): las abiertas del semestre con cupo
// y cierre, "Me apunto" y mis inscripciones con su estado.

export const metadata: Metadata = { title: t("T-144") };

type Search = Record<string, string | string[] | undefined>;

export default async function ConvocatoriasPage({ searchParams }: PageProps<"/app/convocatorias">) {
  const actor = await requireActor("/app/convocatorias");
  const search: Search = await searchParams;
  const inscrita = single(search.inscrita);
  const convocatoriaId = single(search.convocatoria);
  const [term, mine, myGroups] = await Promise.all([
    getCurrentTerm(),
    listMyEntries(actor.personId),
    listGroupIdsOf(actor.personId),
  ]);
  const open = term ? await listOpenCalls(term.id) : [];
  const groups = await listGroupRefs([
    ...open.map((call) => call.groupId),
    ...mine.map((entry) => entry.groupId),
  ]);
  const justApplied = inscrita && convocatoriaId ? await getCall(convocatoriaId) : null;
  const entryLabels = tList("T-899");
  const [porOrden, manual] = tList("T-905");
  const appliedIds = new Set(mine.map((entry) => entry.callId));
  const groupName = (id: string) => groups.get(id)?.name ?? "";
  const mensaje =
    justApplied && inscrita === "ACCEPTED"
      ? t("T-148", { grupo: groupName(justApplied.groupId) })
      : justApplied && inscrita === "WAITLISTED"
        ? t("T-147")
        : justApplied && inscrita === "APPLIED"
          ? t("T-901", { grupo: groupName(justApplied.groupId) })
          : null;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-display-lg">{t("T-144")}</h1>
        <p className="max-w-prose text-lg">{t("T-145")}</p>
        {mensaje ? (
          <output className="flex flex-wrap items-center gap-3 rounded-xl border border-borde bg-oe-yellow-soft px-4 py-3 font-semibold text-oe-navy">
            {mensaje}
            {inscrita === "ACCEPTED" ? <SelloOE tamano="sm" /> : null}
          </output>
        ) : null}
      </header>

      <section aria-labelledby="abiertas" className="flex flex-col gap-4">
        <BarraTitulo color="amarillo" className="self-start">
          <span id="abiertas">{t("T-144")}</span>
        </BarraTitulo>
        {open.length === 0 ? (
          <Vacio texto={t("T-896")} />
        ) : (
          <ul className="grid list-none gap-4 p-0 md:grid-cols-2">
            {open.map((call) => {
              const already = appliedIds.has(call.id);
              const inGroup = myGroups.includes(call.groupId);
              return (
                <li key={call.id}>
                  <Cartel
                    variante="navy"
                    titulo={call.title}
                    eyebrow={groupName(call.groupId)}
                    nivel="h3"
                  >
                    <p className="text-sm">
                      {call.capacity !== null
                        ? t("T-897", { cupo: call.capacity, fecha: formatDate(call.closesAt) })
                        : t("T-898", { fecha: formatDate(call.closesAt) })}
                    </p>
                    <p className="text-sm">{call.selection === "FIRST_COME" ? porOrden : manual}</p>
                    {actor.membershipStatus === "ON_LEAVE" ? (
                      <p className="text-sm">{t("T-2041")}</p>
                    ) : inGroup ? (
                      <p className="text-sm font-semibold">
                        {t("T-900", { grupo: groupName(call.groupId) })}
                      </p>
                    ) : already ? (
                      <p className="text-sm font-semibold">{t("T-903")}</p>
                    ) : (
                      <Link
                        href={`/app/convocatorias/${call.id}`}
                        className="boton-calido mt-2 self-start"
                      >
                        {t("T-146")}
                      </Link>
                    )}
                  </Cartel>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="mis-inscripciones" className="flex flex-col gap-4">
        <BarraTitulo color="azul" className="self-start">
          <span id="mis-inscripciones">{t("T-902")}</span>
        </BarraTitulo>
        {mine.length === 0 ? (
          <p className="text-tinta-suave">—</p>
        ) : (
          <ul className="flex list-none flex-col gap-2 p-0">
            {mine.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-semibold">{entry.callTitle}</span>
                <span className="text-tinta-suave">{groupName(entry.groupId)}</span>
                <Insignia
                  fondo={
                    entry.status === "ACCEPTED"
                      ? "amarillo"
                      : entry.status === "REJECTED"
                        ? "naranja"
                        : entry.status === "WAITLISTED"
                          ? "paper"
                          : "sky"
                  }
                >
                  {entryLabels[CALL_ENTRY_STATUSES.indexOf(entry.status)] ?? entry.status}
                </Insignia>
                {entry.status === "REJECTED" ? (
                  <span className="text-tinta-suave">
                    {t("T-906", { grupo: groupName(entry.groupId) })}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
