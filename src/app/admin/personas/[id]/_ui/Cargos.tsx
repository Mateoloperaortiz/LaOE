import Link from "next/link";
import {
  type MyMembershipView,
  type Person360,
  partitionRoleHistory,
  type RoleHistoryEntry,
} from "@/modules/people";
import { RoleHistoryList } from "@/modules/people/components/RoleHistoryList";
import { Bloque } from "@/shared/admin-kit/AdminFields";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { t, tList } from "@/shared/copy";
import { removeAppointmentAction } from "../actions";

export function Cargos({ data, my }: { data: Person360; my: MyMembershipView }) {
  const { current, past, upcoming } = partitionRoleHistory(
    data.roleHistory,
    my.term,
    Boolean(data.membership && data.membership.status !== "INACTIVE"),
  );
  const [add, remove] = tList("T-447");
  const actions = (entry: RoleHistoryEntry) =>
    entry.appointmentId ? (
      <form action={removeAppointmentAction}>
        <AdminFormBody>
          <input type="hidden" name="personId" value={data.person.id} />
          <input type="hidden" name="appointmentId" value={entry.appointmentId} />
          <AdminSubmitButton
            type="submit"
            className="boton-secundario min-h-9 px-3 py-1 text-xs"
            aria-label={`${remove}: ${entry.label} · ${entry.scope} · ${entry.termCode}`}
          >
            {remove}
          </AdminSubmitButton>
        </AdminFormBody>
      </form>
    ) : null;
  return (
    <>
      <Bloque titulo={t("T-374")}>
        <Link
          href={`/admin/personas/${data.person.id}?pestana=membresia&accion=cargo`}
          className="boton-secundario min-h-9 self-start px-4 py-1 text-sm"
        >
          {add}
        </Link>
        {current.length ? (
          <RoleHistoryList entries={current} actions={actions} />
        ) : (
          <p className="text-sm text-tinta-suave">{t("T-2396")}</p>
        )}
      </Bloque>
      {upcoming.length ? (
        <Bloque titulo={t("T-2397")}>
          <RoleHistoryList entries={upcoming} actions={actions} />
        </Bloque>
      ) : null}
      <Bloque titulo={tList("T-443")[2] ?? ""}>
        {past.length ? (
          <RoleHistoryList entries={past} actions={actions} />
        ) : (
          <p className="text-sm text-tinta-suave">{t("T-2400")}</p>
        )}
      </Bloque>
    </>
  );
}
