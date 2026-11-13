import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOperator } from "@/app/_authz/occasion";
import { single } from "@/app/_lib/search";
import { getOccasion, listCheckIns } from "@/modules/participation";
import { LectorCarnet } from "@/modules/participation/components/LectorCarnet";
import { getPeopleByIds, searchMembersByName } from "@/modules/people";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { t, tList } from "@/shared/copy";
import { formatTime } from "@/shared/lib/dates";
import { ActionForm } from "@/shared/ui/ActionForm";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { decideAction, registerAction, scanAction } from "../actions";

// Modo anfitrión (ADR-035 regla 8): móvil primero, buscar por nombre o escanear el carnet; el token
// oe1 u oe2 lo valida el servidor con readCarnet. No hace falta abrir una sesión en el celular.

type Search = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: PageProps<"/admin/ocasiones/[id]/anfitrion">): Promise<Metadata> {
  const { id } = await params;
  const occasion = await getOccasion(id);
  return { title: occasion ? t("T-614", { título: occasion.title }) : "" };
}

export default async function AnfitrionPage({
  params,
  searchParams,
}: PageProps<"/admin/ocasiones/[id]/anfitrion">) {
  const { id } = await params;
  const search = (await searchParams) as Search;
  const q = single(search.q).trim();
  const error = single(search.error);
  const registrado = single(search.nombre);
  const base = `/admin/ocasiones/${id}/anfitrion`;
  const found = await requireOperator(id, base);
  if (!found) {
    notFound();
  }
  const { actor, occasion } = found;
  const canRegister = occasion.status === "OPEN" || (actor.isAdmin && occasion.status === "CLOSED");
  // Los pendientes, para quien los decide (ADR-168 regla 3): ADMIN, como en la consola completa.
  const [results, recent, pending] = await Promise.all([
    q && canRegister ? searchMembersByName(q) : Promise.resolve([]),
    listCheckIns(id, ["APPROVED"]),
    actor.isAdmin ? listCheckIns(id, ["PENDING"]) : Promise.resolve([]),
  ]);
  const latest = recent.slice(0, 10);
  const people = await getPeopleByIds([
    ...latest.map((item) => item.personId),
    ...pending.map((item) => item.personId),
  ]);
  const [aprobar, rechazar] = tList("T-592");
  const [scan, stop, upload] = tList("T-616");
  const [, altaBoton] = tList("T-598");

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link href={`/admin/ocasiones/${id}`} className="text-sm underline">
          {t("T-584", { título: occasion.title })}
        </Link>
        <h1 className="text-display-lg">{t("T-614", { título: occasion.title })}</h1>
        <p>{t("T-615")}</p>
        {registrado ? (
          <output className="block rounded-xl bg-oe-yellow-soft px-4 py-3 font-semibold text-oe-navy">
            {t("T-602", { nombre: registrado })}
          </output>
        ) : null}
        {error ? (
          <p role="alert" className="font-semibold text-oe-orange">
            {error}
          </p>
        ) : null}
      </header>

      {!canRegister ? (
        <p className="rounded-xl border border-borde bg-fondo px-4 py-3">{t("T-620")}</p>
      ) : (
        <>
          <section aria-label={scan} className="flex flex-col gap-3">
            <LectorCarnet
              labels={{
                scan: scan ?? "",
                stop: stop ?? "",
                upload: upload ?? "",
                cameraError: t("T-617"),
                photoError: t("T-3256"),
                scanError: t("T-3251"),
              }}
              onScan={scanAction.bind(null, id)}
            />
          </section>
          <section aria-label={altaBoton} className="flex flex-col gap-3">
            <ActionForm key={q} action={base} method="get" className="flex items-end gap-3">
              <label className="flex flex-1 flex-col gap-1">
                <span className="eyebrow text-xs">{t("T-599")}</span>
                <input
                  name="q"
                  defaultValue={q}
                  className="w-full rounded-xl border-2 border-borde bg-fondo px-3 py-3 text-lg text-tinta focus:border-titulo focus:outline-none"
                />
              </label>
              <AdminSubmitButton type="submit" className="boton-secundario min-h-12">
                {t("T-250")}
              </AdminSubmitButton>
            </ActionForm>
            {q ? (
              results.length === 0 ? (
                <p className="text-tinta-suave">{t("T-600")}</p>
              ) : (
                <ul className="flex list-none flex-col gap-2 p-0">
                  {results.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-borde bg-fondo px-4 py-3"
                    >
                      <span className="text-lg font-semibold">{item.fullName.trim()}</span>
                      <ActionForm action={registerAction}>
                        <AdminFormBody>
                          <input type="hidden" name="occasionId" value={id} />
                          <input type="hidden" name="personId" value={item.id} />
                          <input type="hidden" name="back" value="anfitrion" />
                          <AdminSubmitButton type="submit" className="boton-primario min-h-12">
                            {altaBoton}
                          </AdminSubmitButton>
                        </AdminFormBody>
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </section>
        </>
      )}

      {pending.length > 0 ? (
        <section aria-labelledby="anfitrion-pendientes" className="flex flex-col gap-2">
          <h2 id="anfitrion-pendientes" className="eyebrow text-xs">
            {t("T-591")} · {pending.length}
          </h2>
          <ul className="flex list-none flex-col gap-2 p-0">
            {pending.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-2 rounded-xl border border-borde bg-fondo px-4 py-3"
              >
                <span className="text-lg font-semibold">
                  {people.get(item.personId)?.fullName?.trim()}
                </span>
                <div className="admin-campo-acciones">
                  {(["APPROVE", "REJECT"] as const).map((decision) => (
                    <ActionForm key={decision} action={decideAction}>
                      <AdminFormBody>
                        <input type="hidden" name="occasionId" value={id} />
                        <input type="hidden" name="checkInId" value={item.id} />
                        <input type="hidden" name="decision" value={decision} />
                        <input type="hidden" name="seen" value={item.status} />
                        <input type="hidden" name="back" value="anfitrion" />
                        <AdminSubmitButton
                          type="submit"
                          className={decision === "APPROVE" ? "boton-primario" : "boton-secundario"}
                        >
                          {decision === "APPROVE" ? aprobar : rechazar}
                        </AdminSubmitButton>
                      </AdminFormBody>
                    </ActionForm>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section aria-label={t("T-603")} className="flex flex-col gap-2">
        <h2 className="eyebrow text-xs">{t("T-603")}</h2>
        {latest.length === 0 ? (
          <p className="text-tinta-suave">{t("T-671")}</p>
        ) : (
          <ul className="flex list-none flex-col gap-1 p-0">
            {latest.map((item) => (
              <li key={item.id} className="border-borde border-b py-1">
                {t("T-621", {
                  nombre: people.get(item.personId)?.fullName?.trim() ?? "",
                  hora: formatTime(item.at),
                })}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
