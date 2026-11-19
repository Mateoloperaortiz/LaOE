import { createId } from "@paralleldrive/cuid2";
import { CreativeDetails } from "@/app/admin/_kit/CreativeDetails";
import type { listCreativeApprovals } from "@/modules/comms";
import type { MemberAnnouncement } from "@/modules/content";
import { boardApprovalLabel, type InternalCommittee } from "@/modules/people";
import { REVIEW_FILE_MAX_BYTES } from "@/shared/adapters/review-file";
import { ResourcePanel } from "@/shared/admin-kit";
import { Casilla } from "@/shared/admin-kit/AdminFields";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { ActionForm } from "@/shared/ui/ActionForm";
import { AppLink as Link } from "@/shared/ui/AppLink";
import {
  createCommitteeAnnouncementAction,
  publishCreativeAction,
  updateProfileAction,
  verifyHistoricalFeedAction,
} from "../actions";
import { CreativeForm } from "./CreativeForm";

// Área Comunicación de la vista del comité (ADR-058, decisión 5): la cartelera interna del comité
// (BOARD) y la presentación y el contacto de la ficha (PROFILE); publicar la ficha y el logo siguen con ADMIN.

const inputClass =
  "w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";

export function Comunicacion({
  slug,
  base,
  committee,
  announcements,
  pieces,
  directors,
  canBoard,
  canProfile,
  accion,
  error,
}: {
  slug: string;
  base: string;
  committee: InternalCommittee;
  announcements: MemberAnnouncement[];
  directors: { id: string; name: string | null }[];
  pieces: Awaited<ReturnType<typeof listCreativeApprovals>>;
  canBoard: boolean;
  canProfile: boolean;
  accion: string;
  error: string;
}) {
  const [carteleraTitulo, nuevoAnuncio, fichaTitulo] = tList("T-2182");
  const [piecesTitle, , , , , request] = tList("T-5178");
  const [publish, record] = tList("T-5182");
  const closeHref = `${base}?area=comunicacion`;
  const alerta = error ? (
    <p role="alert" className="font-semibold text-oe-orange">
      {error}
    </p>
  ) : null;

  return (
    <div className="flex flex-col gap-8">
      {canBoard && (
        <section aria-label={piecesTitle} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-display-md">{piecesTitle}</h2>
            <Link href={`${closeHref}&accion=pieza`} className="boton-primario">
              {request}
            </Link>
          </div>
          <Link href="/app/mercadeo">{tList("T-5186")[0]}</Link>
          {pieces.length > 0 && (
            <ul className="grid list-none gap-3 p-0">
              {pieces.map((piece) => (
                <li
                  key={piece.id}
                  className="grid gap-2 rounded-xl border border-borde bg-fondo px-4 py-3"
                >
                  <h3 className="font-semibold">{piece.title}</h3>
                  {piece.status === "PENDING" && <p>{boardApprovalLabel(piece.status)}</p>}
                  <CreativeDetails piece={piece} />
                  {piece.publishedAt &&
                    piece.channel &&
                    !piece.channelVerified &&
                    directors.length > 0 && (
                      <ActionForm action={verifyHistoricalFeedAction}>
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="pieceId" value={piece.id} />
                        <label>
                          {tList("T-5186")[2]}
                          <select name="director" required defaultValue="">
                            <option value="">{t("T-5187")}</option>
                            {directors.map((row) => (
                              <option key={row.id} value={row.id}>
                                {row.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button type="submit" className="boton-secundario">
                          {tList("T-5186")[6]}
                        </button>
                      </ActionForm>
                    )}
                  {piece.status === "APPROVED" && !piece.publishedAt && (
                    <ActionForm action={publishCreativeAction}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="pieceId" value={piece.id} />
                      <AdminSubmitButton type="submit" className="boton-secundario">
                        {piece.channel === null ? publish : record}
                      </AdminSubmitButton>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {canBoard && accion === "pieza" && (
        <ResourcePanel title={request} closeHref={closeHref} closeLabel={t("T-291")}>
          <CreativeForm
            directors={directors}
            id={createId()}
            slug={slug}
            maxBytes={REVIEW_FILE_MAX_BYTES}
          />
        </ResourcePanel>
      )}
      {canBoard ? (
        <section aria-label={carteleraTitulo} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-display-md">{carteleraTitulo}</h2>
            <Link href={`${closeHref}&accion=anuncio`} className="boton-primario">
              {nuevoAnuncio}
            </Link>
          </div>
          {announcements.length === 0 ? (
            <p className="text-tinta-suave">{t("T-702", { comité: committee.name })}</p>
          ) : (
            <ul className="flex list-none flex-col gap-2 p-0">
              {announcements.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl border border-borde bg-fondo px-4 py-2"
                >
                  <span className="font-semibold">{row.title}</span>
                  <span className="text-sm text-tinta-suave">
                    {formatDateTime(row.publishedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {canProfile ? (
        <section aria-label={fichaTitulo} className="flex flex-col gap-3">
          <h2 className="text-display-md">{fichaTitulo}</h2>
          <p className="max-w-prose text-sm text-tinta-suave">{t("T-2184")}</p>
          <ActionForm action={updateProfileAction} className="flex max-w-prose flex-col gap-4">
            <input type="hidden" name="slug" value={slug} />
            {accion === "" ? alerta : null}
            <label className="flex flex-col gap-1">
              <span className="eyebrow text-xs">{t("T-277")}</span>
              <textarea
                name="presentation"
                rows={8}
                defaultValue={committee.presentation ?? ""}
                className={`${inputClass} font-mono text-sm`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="eyebrow text-xs">{t("T-278")}</span>
              <input
                name="contactUrl"
                type="url"
                defaultValue={committee.contactUrl ?? ""}
                className={inputClass}
              />
            </label>
            <div>
              <AdminSubmitButton type="submit" className="boton-primario">
                {t("T-253")}
              </AdminSubmitButton>
            </div>
          </ActionForm>
        </section>
      ) : null}

      {canBoard && accion === "anuncio" ? (
        <ResourcePanel title={nuevoAnuncio ?? ""} closeHref={closeHref} closeLabel={t("T-291")}>
          <ActionForm action={createCommitteeAnnouncementAction} className="flex flex-col gap-4">
            <AdminFormBody>
              <input type="hidden" name="slug" value={slug} />
              {alerta}
              <p className="max-w-prose text-sm text-tinta-suave">
                {t("T-2183", { comité: committee.name })}
              </p>
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{t("T-335")}</span>
                <input name="title" required minLength={2} maxLength={140} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{t("T-336")}</span>
                <textarea name="body" rows={10} className={`${inputClass} font-mono text-sm`} />
                <span className="text-xs text-tinta-suave">{t("T-337")}</span>
              </label>
              <Casilla id="anuncio-push" name="push" label={t("T-1111")} />
              <div className="flex items-center gap-3">
                <AdminSubmitButton type="submit" className="boton-primario">
                  {t("T-342")}
                </AdminSubmitButton>
                <Link href={closeHref} className="boton-secundario">
                  {t("T-254")}
                </Link>
              </div>
            </AdminFormBody>
          </ActionForm>
        </ResourcePanel>
      ) : null}
    </div>
  );
}
