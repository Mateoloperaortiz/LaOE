import Link from "next/link";
import type { MemberEdition } from "@/modules/events";
import { findOpenRegistrationForm, isRegistered } from "@/modules/forms";
import { OCCASION_CATEGORIES, type OccasionRow, windowState } from "@/modules/participation";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDateRange, formatDateTime } from "@/shared/lib/dates";
import { ArrowUpRightIcon } from "@/shared/ui/icons/ArrowUpRightIcon";
import { PlusIcon } from "@/shared/ui/icons/PlusIcon";
import { Markdown } from "@/shared/ui/Markdown";
import { Vacio } from "./Vacio";

type AgendaItem = {
  key: string;
  title: string;
  label: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string;
  description: string;
} & ({ occasion: OccasionRow; edition?: never } | { edition: MemberEdition; occasion?: never });

export function agendaItems(occasions: OccasionRow[], editions: MemberEdition[]): AgendaItem[] {
  const categories = tList("T-521");
  return [
    ...occasions.map((occasion) => ({
      key: `ocasion-${occasion.id}`,
      title: occasion.title,
      label:
        occasion.kind === "ASSEMBLY"
          ? (tList("T-522")[1] ?? "")
          : (categories[OCCASION_CATEGORIES.indexOf(occasion.category)] ?? ""),
      startsAt: occasion.startsAt,
      endsAt: occasion.endsAt,
      location: occasion.location,
      description: occasion.description,
      occasion,
    })),
    ...editions.map((edition) => ({
      key: `edicion-${edition.id}`,
      title: edition.name,
      label: edition.event.name,
      startsAt: edition.startsAt,
      endsAt: edition.endsAt,
      location: edition.location,
      description: edition.description,
      edition,
    })),
  ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export async function MemberAgenda({
  items,
  personId,
  preview = false,
  selected = "",
  participationAllowed = true,
}: {
  items: AgendaItem[];
  personId: string;
  preview?: boolean;
  selected?: string;
  participationAllowed?: boolean;
}) {
  if (!items.length) return <Vacio texto={t("T-1681")} />;
  const now = new Date();
  return (
    <ul className="member-agenda-list">
      {
        await Promise.all(
          items.map(async (item) => {
            const open = item.occasion && windowState(item.occasion, now) === "OPEN";
            const registration =
              !preview && participationAllowed && item.edition
                ? await findOpenRegistrationForm(item.edition.id, now)
                : null;
            const registered =
              registration && item.edition ? await isRegistered(item.edition.id, personId) : false;
            const summary = (
              <>
                <span>
                  <small>{item.label}</small>
                  {item.occasion ? (
                    <span>
                      <Insignia fondo={open ? "amarillo" : "sky"}>
                        {open ? t("T-553") : t("T-554")}
                      </Insignia>
                    </span>
                  ) : null}
                  <strong>{item.title}</strong>
                  <small>
                    {formatDateRange(item.startsAt, item.endsAt)}
                    {item.location ? ` · ${item.location}` : ""}
                  </small>
                </span>
                {preview ? <ArrowUpRightIcon /> : <PlusIcon />}
              </>
            );
            return (
              <li key={item.key} className="member-agenda-item">
                {preview ? (
                  <>
                    <Link
                      href={`/app/agenda?actividad=${item.key}#${item.key}`}
                      className="member-agenda-summary"
                    >
                      {summary}
                    </Link>
                    {open && participationAllowed ? (
                      <div className="member-agenda-preview-action">
                        <Link href={`/a/${item.occasion.publicId}`} className="boton-calido">
                          {t("T-1670")}
                        </Link>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <details id={item.key} open={selected === item.key}>
                    <summary className="member-agenda-summary">{summary}</summary>
                    <div className="member-agenda-details">
                      {item.occasion?.kind === "ASSEMBLY" ? (
                        <span>
                          <Insignia fondo="naranja">{t("T-556")}</Insignia>
                        </span>
                      ) : null}
                      {item.edition?.audience === "MEMBERS" ? (
                        <span>
                          <Insignia fondo="sky">{t("T-380")}</Insignia>
                        </span>
                      ) : null}
                      {item.description.trim() ? <Markdown source={item.description} /> : null}
                      {item.occasion ? (
                        <p className="text-sm text-tinta-suave">
                          {t("T-1684")}:{" "}
                          {formatDateRange(
                            item.occasion.checkInOpensAt,
                            item.occasion.checkInClosesAt,
                          )}
                        </p>
                      ) : null}
                      {item.occasion && !open ? (
                        <p className="text-sm">
                          {t("T-1671", { fecha: formatDateTime(item.occasion.checkInOpensAt) })}
                        </p>
                      ) : null}
                      <div className="member-agenda-actions">
                        {open && participationAllowed ? (
                          <Link href={`/a/${item.occasion.publicId}`} className="boton-calido">
                            {t("T-1670")}
                          </Link>
                        ) : null}
                        {registration ? (
                          registered ? (
                            <p className="font-semibold">{t("T-869")}</p>
                          ) : (
                            <Link href={`/f/${registration.slug}`} className="boton-calido">
                              {t("T-019")}
                            </Link>
                          )
                        ) : null}
                        {participationAllowed && item.edition?.registrationUrl ? (
                          <a
                            href={item.edition.registrationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="boton-calido"
                          >
                            {t("T-020")}
                          </a>
                        ) : null}
                        {item.edition?.audience === "PUBLIC" ? (
                          <Link
                            href={`/eventos/${item.edition.event.slug}/${item.edition.slug}`}
                            className="boton-secundario"
                          >
                            {t("T-1685")}
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </details>
                )}
              </li>
            );
          }),
        )
      }
    </ul>
  );
}
