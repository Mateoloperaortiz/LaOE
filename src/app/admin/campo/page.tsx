import type { Metadata } from "next";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { canOperateOccasion } from "@/app/_authz/occasion";
import { single } from "@/app/_lib/search";
import { listRequests } from "@/modules/crm";
import { listReservations } from "@/modules/inventory";
import { dayKeyFor, listCheckIns, listOccasionsForTerm } from "@/modules/participation";
import { occasionStatusCell } from "@/modules/participation/admin";
import { getCurrentTerm } from "@/modules/terms";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDateRange } from "@/shared/lib/dates";
import { ActionForm } from "@/shared/ui/ActionForm";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { decideRequestAction } from "../solicitudes/actions";

// El modo de campo (ADR-168, que desarrolla ADR-159 regla 6): en el celular, la Operación solo tiene
// pantalla propia para lo que se hace de pie. Reúne lo de hoy que el actor puede operar, cada cosa en
// su pantalla de siempre:
// - Sus ocasiones de hoy (abiertas, o en borrador y con inicio hoy), con lo registrado y lo pendiente, y el
//   botón a la consola de anfitrión, que escanea el carnet y registra por nombre.
// - Las excusas por aprobar, solo para ADMIN, que es quien decide solicitudes: una excusa se aprueba
//   aquí con un toque; rechazarla pide motivo y se hace en la bandeja, como las otras solicitudes.
// - The Games: la tabla de sus competencias, como operador o como juez.

export const metadata: Metadata = { title: tList("T-4909")[0] ?? "" };

const QUICK_REQUESTS = 5;

/** Una excusa tardía pide motivo para aprobarse (ADR-060 regla 5): esa se abre en la bandeja. */
function isLate(payload: unknown): boolean {
  return typeof payload === "object" && payload !== null && "lateSubmission" in payload
    ? (payload as { lateSubmission?: unknown }).lateSubmission === true
    : false;
}

export default async function CampoPage({ searchParams }: PageProps<"/admin/campo">) {
  const roles = await requireAdminAreaRoles("/admin/campo");
  const search = await searchParams;
  const error = single(search.error);
  const decidida = single(search.decidida);
  const actor = roles.actor;
  const term = await getCurrentTerm();
  const today = dayKeyFor(new Date());
  const candidates = term ? await listOccasionsForTerm(term.id, ["OPEN", "DRAFT"]) : [];
  const todays = candidates.filter(
    (item) => item.status === "OPEN" || dayKeyFor(item.startsAt) === today,
  );
  const operable = (
    await Promise.all(
      todays.map(async (item) => ((await canOperateOccasion(actor, item)) ? item : null)),
    )
  ).filter((item) => item !== null);
  const counts = await Promise.all(
    operable.map(async (item) => {
      const rows = await listCheckIns(item.id, ["APPROVED", "PENDING"]);
      return {
        approved: rows.filter((row) => row.status === "APPROVED").length,
        pending: rows.filter((row) => row.status === "PENDING").length,
      };
    }),
  );
  const excuses = roles.isAdmin
    ? await listRequests({
        status: "PENDING",
        kind: "EXCUSE",
        order: "oldest",
        page: 1,
        pageSize: QUICK_REQUESTS,
      })
    : { rows: [], total: 0 };
  const [titulo, intro] = tList("T-4909");
  const [ocasionesTitulo, escanear, consola] = tList("T-4910");
  const [excusasTitulo, aprobar, ver] = tList("T-4912");
  const [gamesTitulo, verTabla, juzgar] = tList("T-4913");
  // Entregar y recibir inventario (ADR-168 regla 6 enmendada por ADR-191): lo que empieza hoy o ya
  // empezó sin entregarse, y lo que vence hoy o ya se venció sin volver.
  const finDeHoy = new Date(`${today}T23:59:59-05:00`);
  const inventario = roles.operatesInventory ? await listReservations(actor.personId) : [];
  const porEntregar = inventario.filter(
    (row) => row.status === "CONFIRMED" && row.startsAt <= finDeHoy,
  );
  const porRecibir = inventario.filter((row) => row.status === "OUT" && row.endsAt <= finDeHoy);
  const [inventarioTitulo, entregar, recibir] = tList("T-5070");
  const openOnes = operable.filter((item) => item.status === "OPEN");
  const onlyOpen = openOnes.length === 1 ? openOnes[0] : undefined;
  const nothing =
    operable.length === 0 &&
    excuses.rows.length === 0 &&
    roles.competitions.length === 0 &&
    porEntregar.length === 0 &&
    porRecibir.length === 0;

  return (
    <div className="admin-campo mx-auto flex w-full max-w-lg flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-display-lg">{titulo}</h1>
        <p className="text-tinta-secundaria">{intro}</p>
      </header>

      {decidida ? (
        <output className="admin-feedback block rounded-xl bg-oe-yellow-soft px-4 py-3 text-sm font-semibold text-oe-navy">
          {t("T-1008", {
            estado: (tList("T-876")[decidida === "APPROVED" ? 1 : 2] ?? "").toLowerCase(),
          })}
        </output>
      ) : null}
      {error ? (
        <p role="alert" className="font-semibold text-oe-orange">
          {error}
        </p>
      ) : null}

      {nothing ? <p className="admin-campo-vacio">{t("T-4914")}</p> : null}

      {operable.length > 0 ? (
        <section aria-labelledby="campo-ocasiones" className="flex flex-col gap-3">
          <h2 id="campo-ocasiones" className="etiqueta-corta text-tinta-secundaria">
            {ocasionesTitulo}
          </h2>
          <ul className="flex list-none flex-col gap-3 p-0">
            {operable.map((item, index) => (
              <li key={item.id} className="admin-campo-tarjeta">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-lg font-semibold">{item.title}</p>
                  <Insignia fondo={occasionStatusCell(item.status).badge}>
                    {occasionStatusCell(item.status).text}
                  </Insignia>
                </div>
                <p className="text-sm text-tinta-secundaria">
                  {formatDateRange(item.startsAt, item.endsAt)}
                  {item.location ? ` · ${item.location}` : ""}
                </p>
                <p className="text-sm">
                  {t("T-4911", {
                    n: counts[index]?.approved ?? 0,
                    p: counts[index]?.pending ?? 0,
                  })}
                </p>
                <div className="admin-campo-acciones">
                  <Link href={`/admin/ocasiones/${item.id}/anfitrion`} className="boton-primario">
                    {escanear}
                  </Link>
                  <Link href={`/admin/ocasiones/${item.id}`} className="boton-secundario">
                    {consola}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {excuses.rows.length > 0 ? (
        <section aria-labelledby="campo-excusas" className="flex flex-col gap-3">
          <h2 id="campo-excusas" className="etiqueta-corta text-tinta-secundaria">
            {excusasTitulo}
          </h2>
          <ul className="flex list-none flex-col gap-3 p-0">
            {excuses.rows.map((row) => (
              <li key={row.id} className="admin-campo-tarjeta">
                <p className="font-semibold">{row.personName}</p>
                <p className="text-sm text-tinta-secundaria">{row.detail}</p>
                <div className="admin-campo-acciones">
                  {isLate(row.payload) ? null : (
                    <ActionForm action={decideRequestAction}>
                      <AdminFormBody>
                        <input type="hidden" name="requestId" value={row.id} />
                        <input type="hidden" name="returnTo" value="/admin/campo" />
                        <input type="hidden" name="decision" value="APPROVED" />
                        <AdminSubmitButton type="submit" className="boton-primario">
                          {aprobar}
                        </AdminSubmitButton>
                      </AdminFormBody>
                    </ActionForm>
                  )}
                  <Link
                    href={`/admin/solicitudes?solicitud=${row.id}`}
                    className="boton-secundario"
                  >
                    {ver}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {roles.competitions.length > 0 ? (
        <section aria-labelledby="campo-games" className="flex flex-col gap-3">
          <h2 id="campo-games" className="etiqueta-corta text-tinta-secundaria">
            {gamesTitulo}
          </h2>
          <ul className="flex list-none flex-col gap-3 p-0">
            {roles.competitions.map((item) => (
              <li key={item.competitionId} className="admin-campo-tarjeta">
                <p className="font-semibold">{item.name}</p>
                <div className="admin-campo-acciones">
                  {item.operator ? (
                    <Link
                      href={`/admin/the-games/${item.competitionId}`}
                      className="boton-primario"
                    >
                      {verTabla}
                    </Link>
                  ) : null}
                  {item.judgeBaseIds.length > 0 ? (
                    <Link
                      href={`/admin/the-games/${item.competitionId}/juez`}
                      className={item.operator ? "boton-secundario" : "boton-primario"}
                    >
                      {juzgar}
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {porEntregar.length + porRecibir.length > 0 ? (
        <section aria-labelledby="campo-inventario" className="flex flex-col gap-3">
          <h2 id="campo-inventario" className="etiqueta-corta text-tinta-secundaria">
            {inventarioTitulo}
          </h2>
          <ul className="flex list-none flex-col gap-3 p-0">
            {[...porEntregar, ...porRecibir].map((row) => (
              <li key={row.id} className="admin-campo-tarjeta">
                <p className="text-lg font-semibold">{row.scopeLabel}</p>
                <p className="text-sm text-tinta-secundaria">
                  {row.collectorName} ·{" "}
                  {formatDateRange(row.status === "OUT" ? row.endsAt : row.startsAt, null)}
                </p>
                <div className="admin-campo-acciones">
                  <Link
                    href={`/admin/inventario/entregas?reserva=${row.id}`}
                    className="boton-primario"
                  >
                    {row.status === "OUT" ? recibir : entregar}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {onlyOpen ? (
        <div className="admin-campo-barra">
          <Link href={`/admin/ocasiones/${onlyOpen.id}/anfitrion`} className="boton-primario">
            {t("T-4915")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
