import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMeetingPollAs } from "@/modules/availability";
import { AvailabilityEditor } from "@/modules/availability/components/AvailabilityEditor";
import styles from "@/modules/availability/components/availability.module.css";
import { GroupComparison } from "@/modules/availability/components/GroupComparison";
import { CloseMeetingPoll } from "@/modules/availability/components/MeetingPollForm";
import { requireActor } from "@/modules/identity";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { LockIcon } from "@/shared/ui/icons/LockIcon";
import { closeMeetingPollAction, saveAvailabilityAction } from "../../actions";

export const dynamic = "force-dynamic";
// La metadata no contiene nombres ni títulos de propuestas privadas.
export const metadata: Metadata = { title: t("T-4602"), robots: { index: false, follow: false } };

export default async function MeetingPollPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor(`/app/disponibilidad/reuniones/${id}`);
  const data = await getMeetingPollAs({ personId: actor.personId, ip: null }, id).catch(
    (error: unknown) => {
      if (error instanceof DomainError) notFound();
      throw error;
    },
  );
  const days = data.poll.dates.map((date) =>
    new Intl.DateTimeFormat("es-CO", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${date}T12:00:00Z`)),
  );
  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <Link
          className="underline"
          href={`/app/disponibilidad?grupo=${data.group.type}:${data.group.id}`}
        >
          {t("T-4659")}
        </Link>
        <h1>{data.poll.title}</h1>
        <p>{data.group.name}</p>
        <p className={styles.privacy}>
          <LockIcon size={18} />
          {t("T-4604")}
        </p>
        <p className={styles.meta}>{t("T-4671")}</p>
      </header>
      <AvailabilityEditor
        key={id}
        title={t("T-4644")}
        termId={data.termId}
        pollId={id}
        own={data.own}
        closed={data.poll.closed}
        days={days}
        startMinute={data.poll.startMinute}
        endMinute={data.poll.endMinute}
        saveAction={saveAvailabilityAction}
      />
      <GroupComparison
        comparison={data.comparison}
        days={days}
        startMinute={data.poll.startMinute}
        endMinute={data.poll.endMinute}
      />
      {!data.poll.closed && data.poll.canClose ? (
        <CloseMeetingPoll pollId={id} closeAction={closeMeetingPollAction} />
      ) : null}
    </div>
  );
}
