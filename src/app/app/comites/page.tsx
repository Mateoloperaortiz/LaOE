import type { Metadata } from "next";
import { single } from "@/app/_lib/search";
import { excerpt } from "@/modules/content";
import { requireActor } from "@/modules/identity";
import {
  boardApprovalLabel,
  getMyMembership,
  listInternalCommittees,
  myCandidacies,
} from "@/modules/people";
import { t, tList } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";
import { Banner } from "@/shared/ui/Banner";
import { Button } from "@/shared/ui/Button";
import { Field, Select } from "@/shared/ui/Field";
import { cargoEnComite } from "../_ui/PersonaTarjeta";
import { requestCandidacyAction } from "./actions";
import { CommitteeDirectory } from "./CommitteeDirectory";

export const metadata: Metadata = { title: t("T-309") };

export default async function ComitesInternosPage({ searchParams }: PageProps<"/app/comites">) {
  const actor = await requireActor("/app/comites");
  const [mine, all, candidacies, query] = await Promise.all([
    getMyMembership(actor.personId),
    listInternalCommittees(),
    myCandidacies(actor.personId),
    searchParams,
  ]);
  const mineIds = new Set(mine.committees.map((item) => item.committeeId));
  const byId = new Map(all.map((item) => [item.id, item]));
  const [heading, intro, committeeLabel, roleLabel, submit, history, reason] = tList("T-5154");
  return (
    <>
      <CommitteeDirectory
        mine={mine.committees.map((item) => ({
          id: item.committeeId,
          slug: item.committeeSlug,
          name: item.committeeName,
          logoKey: byId.get(item.committeeId)?.logoKey ?? null,
          summary: cargoEnComite(item, item.committeeName),
        }))}
        others={all
          .filter((item) => !mineIds.has(item.id))
          .map((item) => ({
            id: item.id,
            slug: item.slug,
            name: item.name,
            logoKey: item.logoKey,
            summary: excerpt(item.presentation ?? "", 220),
          }))}
      />
      {(candidacies.roles.length > 0 || candidacies.history.length > 0) && (
        <section id="postulaciones" className="mt-6 flex flex-col gap-4">
          <h2 className="titulo-seccion">{heading}</h2>
          {single(query.error) ? (
            <Banner tone="error" title={single(query.error) ?? ""} />
          ) : query.guardado === "1" ? (
            <Banner tone="exito" title={t("T-4302")} />
          ) : null}
          {candidacies.roles.length > 0 && candidacies.term && (
            <form action={requestCandidacyAction} className="flex flex-col items-start gap-3">
              <p>{intro}</p>
              <input type="hidden" name="termId" value={candidacies.term.id} />
              <Field id="postulacion-comite" label={committeeLabel}>
                <Select id="postulacion-comite" name="committeeId" required defaultValue="">
                  <option value="" disabled>
                    —
                  </option>
                  {all.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="postulacion-cargo" label={roleLabel}>
                <Select id="postulacion-cargo" name="roleCode" required defaultValue="">
                  <option value="" disabled>
                    —
                  </option>
                  {candidacies.roles.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit">{submit}</Button>
            </form>
          )}
          {candidacies.history.length > 0 && (
            <>
              <h3>{history}</h3>
              <ul>
                {candidacies.history.map((row) => (
                  <li key={row.id}>
                    {row.committeeName} · {row.roleLabel} · {formatDate(row.requestedAt)} ·{" "}
                    {boardApprovalLabel(row.status)}
                    {row.decisionNote && (
                      <p>
                        {reason}: {row.decisionNote}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </>
  );
}
