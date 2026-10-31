import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireActor } from "@/modules/identity";
import {
  BOOSTER_KINDS,
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MAX_FILES,
  EVIDENCE_MIN_BYTES,
  EVIDENCE_TEXT_MAX,
  EVIDENCE_TEXT_MIN,
  EVIDENCE_TYPES,
  getChallengeForMember,
  listBoostersFor,
  loadGamificationSettings,
  type MemberChallengeDetail,
} from "@/modules/participation";
import { EvidenceUploader } from "@/modules/participation/components/EvidenceUploader";
import { RewardBreakdown } from "@/modules/participation/components/RewardBreakdown";
import { Trivia } from "@/modules/participation/components/Trivia";
import { getCurrentTerm } from "@/modules/terms";
import { Cartel, Insignia } from "@/shared/brand";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDate, formatDateTime } from "@/shared/lib/dates";
import { ActionForm } from "@/shared/ui/ActionForm";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { CircleCheckIcon } from "@/shared/ui/icons/CircleCheckIcon";
import { CircleDotIcon } from "@/shared/ui/icons/CircleDotIcon";
import { Markdown } from "@/shared/ui/Markdown";
import { Vacio } from "../../../_ui/Vacio";
import { setBoosterTargetAction } from "../../boosters/actions";
import { discardEvidenceUploadAction, submitEvidenceAction, submitTriviaAction } from "./actions";

// Detalle de un reto en Mi OE (ADR-067 reglas 3 a 6): la consigna en Markdown, la actividad
// vinculada de los presenciales y el bloque de acción según formato y estado de la entrega.
// correctIndex solo se muestra cuando el reto ya cerró.

export const metadata: Metadata = { title: t("T-2406") };

const KIND_INDEX = { PRESENTIAL: 0, TRIVIA: 1, EVIDENCE: 2 } as const;

function PresentialBlock({ challenge }: { challenge: MemberChallengeDetail }) {
  const participation = challenge.participation;
  if (participation?.status === "COMPLETED") {
    return (
      <section className="flex flex-col gap-2">
        <p className="font-semibold">
          {t("T-2434", { n: challenge.rewardPoints ?? challenge.basePoints })}
        </p>
        {participation.reward ? (
          <RewardBreakdown reward={participation.reward} boosterKind={challenge.boosterKind} />
        ) : null}
      </section>
    );
  }
  if (participation?.status === "PENDING") {
    return (
      <section className="flex flex-col gap-1">
        <p className="font-semibold">{t("T-2449")}</p>
        {challenge.pendingPoints != null ? (
          <p className="text-sm text-tinta-suave">{t("T-2572", { n: challenge.pendingPoints })}</p>
        ) : null}
      </section>
    );
  }
  if (participation?.status === "REJECTED" || participation?.status === "ANNULLED") {
    return <p className="font-semibold">{t("T-2432", { motivo: participation.reason ?? "—" })}</p>;
  }
  if (challenge.state !== "OPEN") {
    // Programado todavía no abre: sin aviso, la ficha ya muestra la fecha límite.
    return challenge.state === "SCHEDULED" ? null : (
      <p className="text-sm text-tinta-suave">{t("T-2438")}</p>
    );
  }
  return (
    <section className="flex flex-col items-start gap-3">
      <p>
        {t("T-2417", {
          actividad: challenge.occasion?.title ?? "",
          fecha: formatDateTime(challenge.closesAt),
        })}
      </p>
      {challenge.occasion ? (
        <Link href={`/a/${challenge.occasion.publicId}`} className="boton-primario">
          {tList("T-2420")[3]}
        </Link>
      ) : null}
    </section>
  );
}

function TriviaAnswered({ challenge }: { challenge: MemberChallengeDetail }) {
  const participation = challenge.participation;
  if (!participation) {
    return null;
  }
  const answers = participation.answers ?? [];
  const reveal = challenge.state === "CLOSED" || challenge.state === "CANCELLED";
  const hasCorrect = challenge.questions.some((question) => question.correctIndex !== null);
  const [tuRespuesta, respuestaCorrecta] = tList("T-2673");
  return (
    <section className="flex flex-col gap-4" aria-labelledby="trivia-resultado">
      <h2 id="trivia-resultado" className="text-display-md">
        {t("T-2573")}
      </h2>
      {participation.score !== null && participation.total !== null ? (
        <p className="font-semibold">
          {participation.status === "COMPLETED"
            ? t("T-2422", {
                aciertos: participation.score,
                total: participation.total,
                n: challenge.rewardPoints ?? challenge.basePoints,
              })
            : `${participation.score} / ${participation.total}`}
        </p>
      ) : null}
      <ol className="flex list-none flex-col gap-4 p-0">
        {challenge.questions.map((question, qIndex) => {
          const chosen = answers[qIndex] ?? null;
          return (
            <li key={question.ordinal} className="flex flex-col gap-1">
              <p className="font-semibold">
                {t("T-2421", { n: qIndex + 1, total: challenge.questions.length })} ·{" "}
                {question.prompt}
              </p>
              <ul className="flex list-none flex-col gap-1 p-0">
                {question.options.map((option, oIndex) => {
                  const isChosen = chosen === oIndex;
                  const isCorrect = reveal && question.correctIndex === oIndex;
                  return (
                    <li
                      key={`${question.ordinal}-${oIndex + 1}`}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-1 text-sm ${
                        isCorrect
                          ? "border-oe-blue bg-oe-blue-soft font-semibold text-oe-navy"
                          : isChosen
                            ? "border-borde bg-fondo font-semibold"
                            : "border-borde text-tinta-suave"
                      }`}
                    >
                      {isChosen ? <CircleDotIcon label={tuRespuesta} /> : null}
                      <span className="min-w-0 flex-1">{option}</span>
                      {isCorrect ? <CircleCheckIcon label={respuestaCorrecta} /> : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
      {reveal && hasCorrect ? (
        <p className="eyebrow text-xs">{t("T-2424")}</p>
      ) : (
        <p className="text-sm text-tinta-suave">{t("T-2425")}</p>
      )}
      {participation.status === "COMPLETED" && participation.reward ? (
        <RewardBreakdown reward={participation.reward} boosterKind={challenge.boosterKind} />
      ) : null}
      {participation.status === "REJECTED" ? (
        <p className="text-sm text-tinta-suave">{participation.reason ?? ""}</p>
      ) : null}
    </section>
  );
}

function EvidenceBlock({ challenge }: { challenge: MemberChallengeDetail }) {
  const participation = challenge.participation;
  if (participation?.status === "COMPLETED") {
    return (
      <section className="flex flex-col gap-2">
        <p className="font-semibold">
          {t("T-2434", { n: challenge.rewardPoints ?? challenge.basePoints })}
        </p>
        {participation.reward ? (
          <RewardBreakdown reward={participation.reward} boosterKind={challenge.boosterKind} />
        ) : null}
      </section>
    );
  }
  if (participation?.status === "PENDING") {
    return (
      <section className="flex flex-col gap-1">
        <p className="font-semibold">{t("T-2433")}</p>
        {challenge.pendingPoints != null ? (
          <p className="text-sm text-tinta-suave">{t("T-2572", { n: challenge.pendingPoints })}</p>
        ) : null}
      </section>
    );
  }
  if (participation?.status === "REJECTED" || participation?.status === "ANNULLED") {
    return <p className="font-semibold">{t("T-2432", { motivo: participation.reason ?? "—" })}</p>;
  }
  if (challenge.state !== "OPEN") {
    return challenge.state === "SCHEDULED" ? null : (
      <p className="text-sm text-tinta-suave">{t("T-2438")}</p>
    );
  }
  return (
    <EvidenceUploader
      challengeId={challenge.id}
      textMin={EVIDENCE_TEXT_MIN}
      textMax={EVIDENCE_TEXT_MAX}
      maxFiles={EVIDENCE_MAX_FILES}
      minBytes={EVIDENCE_MIN_BYTES}
      maxBytes={EVIDENCE_MAX_BYTES}
      allowedTypes={Object.keys(EVIDENCE_TYPES)}
      onSubmit={submitEvidenceAction}
      onDiscard={discardEvidenceUploadAction}
    />
  );
}

export default async function RetoDetallePage({
  params,
  searchParams,
}: PageProps<"/app/gh-points/retos/[id]">) {
  const actor = await requireActor("/app/gh-points/retos");
  const settings = await loadGamificationSettings();
  if (!settings.enabled) {
    redirect("/app/gh-points");
  }
  const { id } = await params;
  const search = await searchParams;
  const boosterError = typeof search.error === "string" ? search.error : "";
  const boosterSaved = typeof search.guardado === "string" ? search.guardado : "";
  const term = await getCurrentTerm();
  if (!term) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-display-lg">{t("T-2406")}</h1>
        <Vacio texto={t("T-548")} />
      </div>
    );
  }
  const challenge = await getChallengeForMember(id, actor.personId);
  if (!challenge) {
    notFound();
  }
  const kindLabel = tList("T-2409")[KIND_INDEX[challenge.kind]] ?? challenge.kind;
  const points = challenge.rewardPoints ?? challenge.basePoints;
  // Selector de booster (ADR-067 regla 8): reto abierto con premio y sin participación.
  const canBoost =
    (challenge.state === "OPEN" || challenge.state === "SCHEDULED") &&
    challenge.basePoints > 0 &&
    !challenge.participation;
  const boosters = canBoost ? await listBoostersFor(actor.personId) : [];
  const available = boosters.filter((item) => item.state === "AVAILABLE");
  const targeted = available.find(
    (item) => item.target?.kind === "CHALLENGE" && item.target.id === challenge.id,
  );
  const boosterNames = tLabels("T-2451", BOOSTER_KINDS);
  const selectorLabels = tList("T-2578");

  return (
    <div className="flex flex-col gap-8">
      <Cartel
        variante="azul"
        nivel="h1"
        eyebrow={kindLabel}
        titulo={challenge.title}
        subtitulo={`${t("T-2412", { fecha: formatDateTime(challenge.closesAt) })} · ${t("T-2413", { n: points })}`}
        elemento={null}
      >
        <div className="mt-6 flex flex-wrap gap-2">
          {challenge.occasion ? (
            <span className="eyebrow text-xs">
              {t("T-2450", { actividad: challenge.occasion.title })}
            </span>
          ) : null}
          <Insignia fondo="paper">{t("T-2577")}</Insignia>
        </div>
      </Cartel>

      {challenge.description ? <Markdown source={challenge.description} /> : null}

      {canBoost && available.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="booster-titulo">
          <h2 id="booster-titulo" className="eyebrow text-xs">
            {t("T-2452")}
          </h2>
          {targeted ? (
            <p className="text-sm font-semibold">
              {t("T-2415", {
                booster: boosterNames[targeted.kind] ?? targeted.kind,
              })}
            </p>
          ) : null}
          <ActionForm action={setBoosterTargetAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="target" value={`challenge:${challenge.id}`} />
            <input type="hidden" name="back" value={`/app/gh-points/retos/${challenge.id}`} />
            <input type="hidden" name="currentBoosterId" value={targeted?.id ?? ""} />
            <label className="flex flex-col gap-1 text-sm font-semibold">
              <select
                name="boosterId"
                defaultValue={targeted?.id ?? ""}
                className="rounded-xl border border-borde bg-fondo px-3 py-2"
              >
                <option value="">{selectorLabels[0]}</option>
                {available.map((item) => (
                  <option key={item.id} value={item.id}>
                    {(selectorLabels[1] ?? "")
                      .replace("{booster}", boosterNames[item.kind] ?? item.kind)
                      .replace("{fecha}", formatDate(item.expiresAt))}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" name="op" value="apuntar" className="boton-secundario">
              {tList("T-2420")[4]}
            </button>
            {targeted ? (
              <button type="submit" name="op" value="quitar" className="boton-secundario text-sm">
                {tList("T-2420")[5]}
              </button>
            ) : null}
          </ActionForm>
          {boosterSaved ? (
            <output className="block font-semibold text-titulo">{t("T-259")}</output>
          ) : null}
          {boosterError ? (
            <p role="alert" className="font-semibold text-oe-orange">
              {boosterError}
            </p>
          ) : null}
        </section>
      ) : null}

      {challenge.kind === "PRESENTIAL" ? (
        <PresentialBlock challenge={challenge} />
      ) : challenge.kind === "TRIVIA" ? (
        challenge.participation ? (
          <TriviaAnswered challenge={challenge} />
        ) : challenge.state === "OPEN" ? (
          <Trivia
            challengeId={challenge.id}
            questions={challenge.questions}
            passPercent={challenge.passPercent ?? 100}
            onSubmit={submitTriviaAction}
          />
        ) : challenge.state === "SCHEDULED" ? null : (
          <p className="text-sm text-tinta-suave">{t("T-2438")}</p>
        )
      ) : (
        <EvidenceBlock challenge={challenge} />
      )}

      <p>
        <Link href="/app/gh-points/retos" className="boton-secundario inline-block">
          {tList("T-2420")[6]}
        </Link>
      </p>
    </div>
  );
}
