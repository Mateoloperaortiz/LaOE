"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCompetitionOperator, requireCompetitionStaff } from "@/app/_authz/competition";
import { formOptional, formRaw, formText } from "@/app/_lib/form";
import {
  addAdjustmentAs,
  adjustRotationTimerAs,
  advanceRotationAs,
  assignStaffAs,
  cancelMarketAs,
  closeRotationAs,
  createAnnouncementAs,
  createExtraAs,
  createMarketAs,
  createTeamAs,
  deleteDayScheduleAs,
  EXTRA_KINDS,
  generateDayScheduleAs,
  getRotation,
  grantStartingCreditsAs,
  type IssuedCode,
  importDayScheduleAs,
  issueTeamCodesAs,
  placeBetAs,
  recordResultAs,
  removeStaffAs,
  resolveMarketAs,
  SCHEDULE_ISSUE_KINDS,
  type ScheduleIssue,
  saveBaseAs,
  saveRotationMatchupsAs,
  setAnnouncementActiveAs,
  setCompetitionStatusAs,
  setExtraPointsAs,
  setMarketOpenAs,
  setRubricScoresAs,
  setTeamStatusAs,
  startRotationAs,
  updateCompetitionSettingsAs,
  voidResultAs,
} from "@/modules/competition";
import type { ImportDayState } from "@/modules/competition/components/ImportarJornada";
import { t, tList } from "@/shared/copy";
import { bogotaInputToUtc } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";

// Acciones del panel de The Games (ADR-089, ADR-091): cada POST vuelve a comprobar el rol en la
// competencia y el dominio lo relee dentro de la transacción. Vuelven a la pestaña de origen con
// `?guardado=1` o `?error=…`.

const AREAS = [
  "resumen",
  "equipos",
  "bases",
  "personal",
  "rotaciones",
  "resultados",
  "posiciones",
  "extras",
  "anuncios",
  "apuestas",
] as const;

const OPERATIONS = [
  "settings",
  "status",
  "create-team",
  "team-status",
  "save-base",
  "assign-staff",
  "remove-staff",
  "generate-day",
  "delete-day",
  "start-rotation",
  "close-rotation",
  "advance-rotation",
  "adjust-timer",
  "swap-bases",
  "edit-matchup",
  "record-result",
  "void-result",
  "create-extra",
  "extra-points",
  "rubric-scores",
  "adjustment",
  "announce",
  "announcement-active",
  "grant-credits",
  "create-market",
  "market-open",
  "market-close",
  "market-cancel",
  "market-resolve",
  "place-bet",
] as const;

const cuid = z.string().regex(/^[a-z0-9]{10,40}$/);
const inputSchema = z.object({
  competitionId: cuid,
  area: z.enum(AREAS).default("resumen"),
  operation: z.enum(OPERATIONS),
});

const checkbox = (form: FormData, name: string) => form.get(name) === "on";
const nullable = (form: FormData, name: string) => formOptional(form, name) ?? null;

/** Un resumen legible de los problemas del validador, para la vuelta con `?error=`. */
function describeIssues(issues: readonly ScheduleIssue[]): string {
  const labels = tList("T-2841");
  const kinds = [...new Set(issues.map((issue) => issue.kind))];
  return kinds.map((kind) => labels[SCHEDULE_ISSUE_KINDS.indexOf(kind)] ?? kind).join(" · ");
}

async function run(
  form: FormData,
  input: z.infer<typeof inputSchema>,
  actorOf: () => Promise<Parameters<typeof createTeamAs>[0]>,
): Promise<string | null> {
  const id = input.competitionId;
  const actor = await actorOf();
  switch (input.operation) {
    case "settings":
      await updateCompetitionSettingsAs(actor, id, {
        name: formText(form, "name"),
        firstDayOn: nullable(form, "firstDayOn"),
        secondDayOn: nullable(form, "secondDayOn"),
        registrationFormId: nullable(form, "registrationFormId"),
        bettingEnabled: checkbox(form, "bettingEnabled"),
        startingCredits: formOptional(form, "startingCredits")
          ? Number(formText(form, "startingCredits"))
          : null,
        allowSelfBet: checkbox(form, "allowSelfBet"),
      });
      return null;
    case "status":
      await setCompetitionStatusAs(
        actor,
        id,
        z.enum(["DRAFT", "LIVE", "FINISHED", "ARCHIVED"]).parse(formText(form, "status")),
      );
      return null;
    case "create-team":
      await createTeamAs(actor, id, {
        number: Number(formText(form, "number")),
        name: formText(form, "name"),
        color: nullable(form, "color"),
        submissionId: nullable(form, "submissionId"),
      });
      return null;
    case "team-status":
      await setTeamStatusAs(
        actor,
        id,
        cuid.parse(formText(form, "teamId")),
        z.enum(["ACTIVE", "WITHDRAWN"]).parse(formText(form, "status")),
      );
      return null;
    case "save-base":
      await saveBaseAs(actor, id, nullable(form, "baseId"), {
        day: Number(formText(form, "day")),
        // La pantalla cuenta desde 1; el dominio, desde 0.
        orderIndex: Number(formText(form, "orderIndex")) - 1,
        name: formText(form, "name"),
        kind: z.enum(["NORMAL", "MACRO"]).parse(formText(form, "kind")),
        location: nullable(form, "location"),
      });
      return null;
    case "assign-staff":
      await assignStaffAs(actor, id, {
        personId: formText(form, "personId"),
        role: z.enum(["OPERATOR", "JUDGE"]).parse(formText(form, "role")),
        baseId: nullable(form, "baseId"),
      });
      return null;
    case "remove-staff":
      await removeStaffAs(actor, id, cuid.parse(formText(form, "staffId")));
      return null;
    case "generate-day":
      await generateDayScheduleAs(actor, id, {
        day: Number(formText(form, "day")),
        rotations: Number(formText(form, "rotations")),
        plannedMinutes: Number(formText(form, "plannedMinutes")),
      });
      return null;
    case "delete-day":
      await deleteDayScheduleAs(actor, id, Number(formText(form, "day")));
      return null;
    case "start-rotation":
      await startRotationAs(actor, id, cuid.parse(formText(form, "rotationId")));
      return null;
    case "close-rotation":
      await closeRotationAs(actor, id, cuid.parse(formText(form, "rotationId")));
      return null;
    case "advance-rotation":
      await advanceRotationAs(actor, id);
      return null;
    case "adjust-timer":
      await adjustRotationTimerAs(
        actor,
        id,
        cuid.parse(formText(form, "rotationId")),
        z.coerce.number().int().parse(formText(form, "deltaSeconds")),
      );
      return null;
    case "swap-bases":
    case "edit-matchup": {
      const rotationId = cuid.parse(formText(form, "rotationId"));
      const rotation = await getRotation(id, rotationId);
      if (!rotation) throw new DomainError(t("T-2764"));
      const rows = rotation.matchups.map((matchup) => ({
        id: matchup.id,
        baseId: matchup.base.id,
        teamAId: matchup.teamA.id,
        teamBId: matchup.teamB.id,
      }));
      const first = rows.find((row) => row.id === formText(form, "matchupId"));
      if (!first) throw new DomainError(t("T-2764"));
      if (input.operation === "swap-bases") {
        const second = rows.find((row) => row.id === formText(form, "otherMatchupId"));
        if (!second || second.id === first.id) throw new DomainError(t("T-2764"));
        [first.baseId, second.baseId] = [second.baseId, first.baseId];
      } else {
        first.baseId = formText(form, "baseId") || first.baseId;
        first.teamAId = formText(form, "teamAId") || first.teamAId;
        first.teamBId = formText(form, "teamBId") || first.teamBId;
      }
      const result = await saveRotationMatchupsAs(actor, id, rotationId, {
        matchups: rows.map(({ baseId, teamAId, teamBId }) => ({ baseId, teamAId, teamBId })),
        confirmWarnings: checkbox(form, "confirmWarnings"),
      });
      if (!result.saved) {
        const issues = result.report.errors.length ? result.report.errors : result.newWarnings;
        return `${t("T-2776")} ${describeIssues(issues)}`;
      }
      return null;
    }
    case "record-result":
      await recordResultAs(actor, id, {
        matchupId: formText(form, "matchupId"),
        outcome: z.enum(["A_WIN", "B_WIN", "DRAW"]).parse(formText(form, "outcome")),
        notes: formText(form, "notes"),
      });
      return null;
    case "void-result":
      await voidResultAs(actor, id, cuid.parse(formText(form, "matchupId")));
      return null;
    case "create-extra":
      await createExtraAs(actor, id, {
        name: formText(form, "name"),
        day: Number(formText(form, "day")),
        kind: z.enum(EXTRA_KINDS).parse(formText(form, "kind") || "DIRECT"),
      });
      return null;
    case "rubric-scores":
      await setRubricScoresAs(actor, id, {
        extraId: formText(form, "extraId"),
        teamId: formText(form, "teamId"),
        scores: form.getAll("scores").map((value) => Number(String(value).trim())),
      });
      return null;
    case "extra-points":
      await setExtraPointsAs(actor, id, {
        extraId: formText(form, "extraId"),
        teamId: formText(form, "teamId"),
        total: Number(formText(form, "total")),
      });
      return null;
    case "adjustment":
      await addAdjustmentAs(actor, id, {
        teamId: formText(form, "teamId"),
        day: Number(formText(form, "day")),
        points: Number(formText(form, "points")),
        reason: formText(form, "reason"),
      });
      return null;
    case "announce":
      await createAnnouncementAs(actor, id, {
        message: formText(form, "message"),
        level: z.enum(["INFO", "WARNING", "URGENT"]).parse(formText(form, "level")),
      });
      return null;
    case "announcement-active":
      await setAnnouncementActiveAs(
        actor,
        id,
        cuid.parse(formText(form, "announcementId")),
        formText(form, "active") === "true",
      );
      return null;
    case "grant-credits":
      await grantStartingCreditsAs(actor, id);
      return null;
    case "create-market": {
      const closesAt = formOptional(form, "closesAt");
      await createMarketAs(actor, id, {
        title: formText(form, "title"),
        teamIds: form.getAll("teamIds").map(String),
        closesAt: closesAt ? bogotaInputToUtc(closesAt) : null,
      });
      return null;
    }
    case "market-open":
    case "market-close":
      await setMarketOpenAs(
        actor,
        id,
        cuid.parse(formText(form, "marketId")),
        input.operation === "market-open",
      );
      return null;
    case "market-cancel":
      await cancelMarketAs(actor, id, cuid.parse(formText(form, "marketId")));
      return null;
    case "market-resolve":
      await resolveMarketAs(
        actor,
        id,
        cuid.parse(formText(form, "marketId")),
        cuid.parse(formText(form, "winnerTeamId")),
      );
      return null;
    case "place-bet": {
      const result = await placeBetAs(actor, id, {
        marketId: formText(form, "marketId"),
        teamId: formText(form, "teamId"),
        pickTeamId: formText(form, "pickTeamId"),
        stake: Number(formText(form, "stake")),
        code: formText(form, "code"),
      });
      if (!result.ok) return result.message;
      return `ok:${t("T-2874", { saldo: result.balance })}`;
    }
  }
}

/** El despachador de todas las operaciones del panel del operador. */
export async function competitionAction(form: FormData): Promise<void> {
  const parsed = inputSchema.safeParse({
    competitionId: formText(form, "competitionId"),
    area: formText(form, "area") || undefined,
    operation: formText(form, "operation"),
  });
  if (!parsed.success) redirect("/admin/the-games");
  const input = parsed.data;
  const base = `/admin/the-games/${input.competitionId}`;
  const access = await requireCompetitionOperator(input.competitionId, base);
  const query = new URLSearchParams({ area: input.area });
  const rotation = formText(form, "back-rotation");
  if (rotation) query.set("rotacion", rotation);
  let outcome: string | null;
  try {
    outcome = await run(form, input, access.commandActor);
  } catch (error) {
    if (error instanceof DomainError) outcome = error.message;
    else if (error instanceof z.ZodError) outcome = t("T-260");
    else throw error;
  }
  if (outcome?.startsWith("ok:")) query.set("aviso", outcome.slice(3));
  else if (outcome) query.set("error", outcome);
  else query.set("guardado", "1");
  revalidatePath(base);
  redirect(`${base}?${query}`);
}

/** El juez registra un desenlace desde su pantalla; el dominio limita a su base y a la rotación en
 *  curso (ADR-089 regla 10). */
export async function judgeResultAction(form: FormData): Promise<void> {
  const competitionId = cuid.safeParse(formText(form, "competitionId"));
  if (!competitionId.success) redirect("/admin");
  const base = `/admin/the-games/${competitionId.data}/juez`;
  const access = await requireCompetitionStaff(competitionId.data, base);
  const query = new URLSearchParams();
  try {
    const outcome = z.enum(["A_WIN", "B_WIN", "DRAW"]).parse(formText(form, "outcome"));
    await recordResultAs(await access.commandActor(), competitionId.data, {
      matchupId: formText(form, "matchupId"),
      outcome,
    });
    query.set("guardado", formText(form, "label"));
  } catch (error) {
    if (error instanceof DomainError) query.set("error", error.message);
    else if (error instanceof z.ZodError) query.set("error", t("T-260"));
    else throw error;
  }
  redirect(`${base}?${query}`);
}

/** Emite los códigos de equipo y los devuelve una sola vez al navegador, que arma las tarjetas: nunca
 *  viajan en una URL ni quedan en la auditoría (ADR-089 regla 3). */
export async function issueCodesAction(
  _previous: { codes: IssuedCode[]; error: string | null },
  form: FormData,
): Promise<{ codes: IssuedCode[]; error: string | null }> {
  const competitionId = cuid.safeParse(formText(form, "competitionId"));
  if (!competitionId.success) return { codes: [], error: t("T-2764") };
  const access = await requireCompetitionOperator(
    competitionId.data,
    `/admin/the-games/${competitionId.data}?area=equipos`,
  );
  try {
    const codes = await issueTeamCodesAs(
      await access.commandActor(),
      competitionId.data,
      formText(form, "scope") !== "all",
    );
    revalidatePath(`/admin/the-games/${competitionId.data}`);
    return { codes, error: null };
  } catch (error) {
    if (error instanceof DomainError) return { codes: [], error: error.message };
    throw error;
  }
}

/** Importa una jornada desde la hoja pegada (ADR-094). Si no se guarda, devuelve los problemas y la
 *  hoja para corregirla; si se guarda, vuelve a Rotaciones con el resumen. */
export async function importDayAction(
  previous: ImportDayState,
  form: FormData,
): Promise<ImportDayState> {
  const competitionId = cuid.safeParse(formText(form, "competitionId"));
  if (!competitionId.success) return { ...previous, errors: [t("T-2764")], warnings: [] };
  const base = `/admin/the-games/${competitionId.data}`;
  const access = await requireCompetitionOperator(competitionId.data, `${base}?area=rotaciones`);
  const day = Number(formText(form, "day"));
  const state = {
    text: formRaw(form, "text"),
    minutes: formText(form, "plannedMinutes"),
    attempt: previous.attempt + 1,
  };
  let result: Awaited<ReturnType<typeof importDayScheduleAs>>;
  try {
    result = await importDayScheduleAs(await access.commandActor(), competitionId.data, {
      day,
      plannedMinutes: Number(state.minutes),
      text: state.text,
      confirmWarnings: checkbox(form, "confirmWarnings"),
    });
  } catch (error) {
    if (error instanceof DomainError) return { ...state, errors: [error.message], warnings: [] };
    if (error instanceof z.ZodError) return { ...state, errors: [t("T-260")], warnings: [] };
    throw error;
  }
  if (!result.saved) return { ...state, errors: result.errors, warnings: result.warnings };
  revalidatePath(base);
  const query = new URLSearchParams({
    area: "rotaciones",
    aviso: t("T-2908", {
      dia: day,
      rotaciones: result.rotations,
      enfrentamientos: result.matchups,
      equipos: result.teamsCreated,
      bases: result.basesCreated,
    }),
  });
  redirect(`${base}?${query}`);
}
