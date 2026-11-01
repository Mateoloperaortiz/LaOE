import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { single } from "@/app/_lib/search";
import { type AvailabilityGroup, getAvailabilityAs } from "@/modules/availability";
import { AvailabilityEditor } from "@/modules/availability/components/AvailabilityEditor";
import styles from "@/modules/availability/components/availability.module.css";
import { GroupComparison } from "@/modules/availability/components/GroupComparison";
import { MeetingPollForm } from "@/modules/availability/components/MeetingPollForm";
import { requireActor } from "@/modules/identity";
import { t, tList } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { ActionForm } from "@/shared/ui/ActionForm";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { LockIcon } from "@/shared/ui/icons/LockIcon";
import { createMeetingPollAction, saveAvailabilityAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("T-4600"), robots: { index: false, follow: false } };

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActor("/app/disponibilidad");
  const params = await searchParams;
  const raw = single(params.grupo);
  let group: Pick<AvailabilityGroup, "type" | "id"> | undefined;
  if (raw) {
    const [type, id, extra] = raw.split(":");
    if (
      (type !== "COMMITTEE" && type !== "WORK_GROUP") ||
      !id ||
      id.length > 100 ||
      extra !== undefined
    )
      notFound();
    group = { type, id };
  }
  const data = await getAvailabilityAs(
    { personId: actor.personId, ip: null },
    group ? { group } : {},
  ).catch((error: unknown) => {
    if (error instanceof DomainError) notFound();
    throw error;
  });
  const selected = data.groups.find((item) => item.type === group?.type && item.id === group.id);
  const days = [...tList("T-4619")];
  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1>{t("T-4600")}</h1>
        <p>{t("T-4603")}</p>
        <p className={styles.privacy}>
          <LockIcon size={18} />
          {t("T-4604")}
        </p>
      </header>
      {!data.term ? (
        <p>{t("T-4610")}</p>
      ) : (
        <>
          <p className={styles.meta}>{t("T-4641", { semestre: data.term.code })}</p>
          <AvailabilityEditor
            key={data.term.id}
            title={t("T-4601")}
            termId={data.term.id}
            own={data.own}
            days={days}
            startMinute={0}
            endMinute={1440}
            saveAction={saveAvailabilityAction}
          />
          <section
            aria-labelledby="compare-group"
            className={`${styles.section} ${styles.divider}`}
          >
            <h2 id="compare-group">{t("T-4612")}</h2>
            {data.groups.length ? (
              <ActionForm key={raw ?? ""} action="/app/disponibilidad" className={styles.toolbar}>
                <label className={styles.field} htmlFor="availability-group">
                  {t("T-4613")}
                  <select id="availability-group" name="grupo" defaultValue={raw ?? ""} required>
                    <option value="">{t("T-4613")}</option>
                    {data.groups.map((item) => (
                      <option key={`${item.type}:${item.id}`} value={`${item.type}:${item.id}`}>
                        {item.name} · {t(item.type === "COMMITTEE" ? "T-4650" : "T-4651")}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="boton-secundario">
                  {t("T-4649")}
                </button>
              </ActionForm>
            ) : (
              <p>{t("T-4614")}</p>
            )}
            {data.comparison && selected ? (
              <>
                <h3>{selected.name}</h3>
                <GroupComparison
                  key={`${selected.type}:${selected.id}`}
                  comparison={data.comparison}
                  days={days}
                  startMinute={0}
                  endMinute={1440}
                />
                <section
                  aria-labelledby="dated-proposals"
                  className={`${styles.section} ${styles.divider}`}
                >
                  <h2 id="dated-proposals">{t("T-4602")}</h2>
                  <p className={styles.meta}>{t("T-4671")}</p>
                  {data.polls.length ? (
                    <ul className={styles.proposals}>
                      {data.polls.map((poll) => (
                        <li key={poll.id}>
                          <Link href={`/app/disponibilidad/reuniones/${poll.id}`}>
                            {poll.title}
                          </Link>
                          <span className={styles.meta}>
                            {poll.closed ? t("T-4637") : poll.dates.join(" · ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{t("T-4635")}</p>
                  )}
                  {data.canCreate ? (
                    <MeetingPollForm
                      key={`${selected.type}:${selected.id}`}
                      termId={data.term.id}
                      group={selected}
                      today={todayKey()}
                      endsOn={data.term.endsOn}
                      createAction={createMeetingPollAction}
                    />
                  ) : (
                    <p>{t("T-4660")}</p>
                  )}
                </section>
              </>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
