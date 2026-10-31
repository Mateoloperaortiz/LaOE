import Link from "next/link";
import { APPLIES_TO, COMPUTATIONS } from "@/modules/permanence";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { AdminTableRegion } from "@/shared/admin-kit/AdminTableRegion";
import { Insignia } from "@/shared/brand";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { ActionForm } from "@/shared/ui/ActionForm";

// Una tabla de permanencia (general o de un comité) con sus sumas frente al nominal, su estado y sus
// criterios; los enlaces de edición los arma la página según el rol.

export interface TablaReglasRow {
  id: string;
  key: string;
  label: string;
  weight: number;
  appliesTo: "ALL" | "NEW" | "VETERAN";
  computation: string;
  sortOrder: number;
}

type Props = {
  titulo: string;
  nominal: number;
  sums: { veterans: number; newcomers: number };
  deviates: boolean;
  rules: TablaReglasRow[];
  lockedAt: Date | null;
  comment: string | null;
  /** Enlace para editar cada criterio; null cuando no se puede editar. */
  editHref: ((id: string) => string) | null;
  deleteAction: ((formData: FormData) => void | Promise<void>) | null;
  /** Campos ocultos que la acción de borrar necesita (término, comité o slug). */
  deleteHidden: Record<string, string>;
  acciones: React.ReactNode;
};

export function TablaReglas({
  titulo,
  nominal,
  sums,
  deviates,
  rules,
  lockedAt,
  comment,
  editHref,
  deleteAction,
  deleteHidden,
  acciones,
}: Props) {
  const [sinCriterios, abierta] = tList("T-738");
  const appliesLabels = tLabels("T-717", APPLIES_TO);
  // El cálculo de una regla llega como texto: uno que el modelo no trae cae al respaldo.
  const computationLabels: Readonly<Record<string, string>> = tLabels("T-718", COMPUTATIONS);
  const [clave, nombre, , peso, aplicaA, calculo, orden] = tList("T-716");
  const estado = lockedAt
    ? t("T-738").split(" · ")[2]?.replace("{fecha}", formatDateTime(lockedAt))
    : rules.length === 0
      ? sinCriterios
      : abierta;
  return (
    <section
      aria-label={titulo}
      className="flex flex-col gap-4 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-display-md">{titulo}</h2>
          <p className="text-sm text-tinta-suave">
            {t("T-713", { v: sums.veterans, n: sums.newcomers, nominal })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Insignia fondo={lockedAt ? "naranja" : rules.length === 0 ? "paper" : "sky"}>
              {estado ?? ""}
            </Insignia>
            {deviates && rules.length > 0 ? (
              <span className="text-sm font-semibold text-oe-navy">{t("T-714", { nominal })}</span>
            ) : null}
          </div>
          {comment ? (
            <p className="rounded-xl bg-oe-yellow-soft px-3 py-2 text-oe-navy text-sm">{comment}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">{acciones}</div>
      </div>
      {rules.length > 0 ? (
        <AdminTableRegion label={titulo} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th scope="col" className="eyebrow py-2 pr-3 text-xs">
                  {orden}
                </th>
                <th scope="col" className="eyebrow py-2 pr-3 text-xs">
                  {nombre}
                </th>
                <th scope="col" className="eyebrow py-2 pr-3 text-xs">
                  {clave}
                </th>
                <th scope="col" className="eyebrow py-2 pr-3 text-xs">
                  {peso}
                </th>
                <th scope="col" className="eyebrow py-2 pr-3 text-xs">
                  {aplicaA}
                </th>
                <th scope="col" className="eyebrow py-2 pr-3 text-xs">
                  {calculo}
                </th>
                {editHref ? <th scope="col" className="py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-borde border-t">
                  <td className="py-2 pr-3 tabular-nums">{rule.sortOrder}</td>
                  <td className="py-2 pr-3 font-semibold">{rule.label}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{rule.key}</td>
                  <td className="py-2 pr-3 tabular-nums">{rule.weight}</td>
                  <td className="py-2 pr-3">{appliesLabels[rule.appliesTo] ?? ""}</td>
                  <td className="py-2 pr-3">
                    {computationLabels[rule.computation] ?? rule.computation}
                  </td>
                  {editHref ? (
                    <td className="py-2 text-right whitespace-nowrap">
                      <Link href={editHref(rule.id)} className="underline">
                        {t("T-252")}
                      </Link>
                      {deleteAction ? (
                        <ActionForm action={deleteAction} className="ml-3 inline">
                          <AdminFormBody>
                            <input type="hidden" name="id" value={rule.id} />
                            {Object.entries(deleteHidden).map(([name, value]) => (
                              <input key={name} type="hidden" name={name} value={value} />
                            ))}
                            <AdminSubmitButton type="submit" className="underline">
                              {t("T-843")}
                            </AdminSubmitButton>
                          </AdminFormBody>
                        </ActionForm>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableRegion>
      ) : null}
    </section>
  );
}
