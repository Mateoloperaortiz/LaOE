import { Campo, Casilla, inputClass } from "@/shared/admin-kit/AdminFields";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { t, tList } from "@/shared/copy";
import { ActionForm } from "@/shared/ui/ActionForm";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { macroeventAction } from "../actions";
import { Fields, type MacroContext, MemberSelect } from "./Fields";

export function Board({
  context,
  roles,
  board,
  members,
  hasEdition,
  editionsHref,
}: {
  context: MacroContext;
  roles: Array<{ code: string; label: string }>;
  board: Array<{
    id: string;
    personId: string;
    fullName: string;
    roleCode: string;
    roleLabel: string;
    coDirector: boolean;
  }>;
  members: Array<{ personId: string; fullName: string }>;
  hasEdition: boolean;
  editionsHref: string;
}) {
  const [cargo, persona, , quitar] = tList("T-2270");
  const [excepcion, ayuda] = tList("T-2283");
  // Los cargos históricos retirados siguen siendo visibles y removibles.
  const visibleRoles = [
    ...roles,
    ...board
      .filter((row) => !roles.some((role) => role.code === row.roleCode))
      .filter(
        (row, index, rows) => rows.findIndex((other) => other.roleCode === row.roleCode) === index,
      )
      .map((row) => ({ code: row.roleCode, label: row.roleLabel })),
  ];
  return (
    <div className="flex flex-col gap-8">
      {!hasEdition ? (
        <div className="flex flex-col items-start gap-3">
          <p className="max-w-prose text-tinta-suave">{t("T-2354")}</p>
          <Link className="boton-secundario" href={editionsHref}>
            {t("T-2356")}
          </Link>
        </div>
      ) : null}
      <ul className="m-0 list-none divide-y divide-borde border-y border-borde p-0">
        {visibleRoles.map((role) => (
          <li key={role.code} className="grid gap-3 py-4 lg:grid-cols-[minmax(12rem,1fr)_2fr]">
            <h3 className="font-semibold">{role.label}</h3>
            <div className="flex flex-col gap-3">
              {[false, true].map((coDirector) => {
                const row = board.find(
                  (item) => item.roleCode === role.code && item.coDirector === coDirector,
                );
                return (
                  <div
                    key={String(coDirector)}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <div>
                      <span className="text-tinta-suave">
                        {coDirector ? t("T-2153") : t("T-2373")}:{" "}
                      </span>
                      {row ? (
                        <Link className="underline" href={`/admin/personas/${row.personId}`}>
                          {row.fullName}
                        </Link>
                      ) : (
                        <span>{t("T-2357")}</span>
                      )}
                    </div>
                    {row ? (
                      <ActionForm action={macroeventAction}>
                        <AdminFormBody>
                          <Fields context={context} operation="remove-director" />
                          <input type="hidden" name="appointmentId" value={row.id} />
                          <AdminSubmitButton
                            className="min-h-11 min-w-11 underline"
                            type="submit"
                            aria-label={`${quitar} · ${row.fullName}`}
                          >
                            {quitar}
                          </AdminSubmitButton>
                        </AdminFormBody>
                      </ActionForm>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      {hasEdition ? (
        <section aria-labelledby="nombrar" className="flex flex-col gap-4">
          <h2 id="nombrar" className="text-display-md">
            {t("T-2374")}
          </h2>
          <p className="max-w-prose text-sm text-tinta-suave">{t("T-2267")}</p>
          <ActionForm action={macroeventAction} className="flex max-w-xl flex-col gap-4">
            <AdminFormBody>
              <Fields context={context} operation="add-director" />
              <Campo id="roleCode" label={cargo ?? ""}>
                <select
                  id="roleCode"
                  name="roleCode"
                  className={inputClass}
                  required
                  defaultValue=""
                >
                  <option value="">—</option>
                  {roles.map((role) => (
                    <option key={role.code} value={role.code}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </Campo>
              <MemberSelect
                members={members.filter(
                  (member) => !board.some((row) => row.personId === member.personId),
                )}
                name="personId"
                label={persona ?? ""}
              />
              <Casilla id="coDirector" name="coDirector" label={t("T-2153")} />
              <Campo id="overrideReason" label={excepcion ?? ""} help={ayuda ?? ""}>
                <input id="overrideReason" name="overrideReason" className={inputClass} />
              </Campo>
              <AdminSubmitButton className="boton-primario self-start" type="submit">
                {t("T-2374")}
              </AdminSubmitButton>
            </AdminFormBody>
          </ActionForm>
        </section>
      ) : null}
    </div>
  );
}
