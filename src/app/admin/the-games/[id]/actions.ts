"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCompetitionOperator, requireCompetitionStaff } from "@/app/_authz/competition";
import { formOptional, formRaw, formText } from "@/app/_lib/form";
import {
  addAdjustmentAs,
  addPowerGrantAs,
  adjustRotationTimerAs,
  advanceRotationAs,
  assignStaffAs,
  cancelMarketAs,
  clearCaptainsAs,
  closeRotationAs,
  createAnnouncementAs,
  createExtraAs,
  createMarketAs,
  createTeamAs,
  dayName,
  declarePowerAs,
  deleteDayScheduleAs,
  deliverPowerGrantsAs,
  EXTRA_KINDS,
  generateDayScheduleAs,
  getRotation,
  grantStartingCreditsAs,
  type IssuedCode,
  importCaptainsAs,
  importDayScheduleAs,
  importJuryScoresAs,
  importPowerGrantsAs,
  importStaffSheetAs,
  issueTeamCodesAs,
  POWER_TYPES,
  placeBetAs,
  recordResultAs,
  removeJuryScoresAs,
  removeStaffAs,
  removeSupportAs,
  resolveMarketAs,
  revertPowerUseAs,
  SCHEDULE_ISSUE_KINDS,
  type ScheduleIssue,
  saveBaseAs,
  saveRotationMatchupsAs,
  setAnnouncementActiveAs,
  setCaptainsVisibilityAs,
  setCompetitionStatusAs,
  setExtraPointsAs,
  setMarketOpenAs,
  setRubricScoresAs,
  setStandingsVisibilityAs,
  setTeamStatusAs,
  startMatchupAs,
  startRotationAs,
  updateCompetitionSettingsAs,
  voidPowerGrantAs,
  voidResultAs,
} from "@/modules/competition";
import type { ImportCaptainsState } from "@/modules/competition/components/ImportarCapitanes";
import type { ImportDayState } from "@/modules/competition/components/ImportarJornada";
import type { ImportJuryState } from "@/modules/competition/components/ImportarJurado";
import type {
  ImportStaffState,
  StaffPreviewState,
} from "@/modules/competition/components/ImportarPersonal";
import type { ImportPowersState } from "@/modules/competition/components/ImportarPoderes";
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
  "poderes",
] as const;

const OPERATIONS = [
  "settings",
  "status",
  "create-team",
  "team-status",
  "captains-visibility",
  "clear-captains",
  "standings-visibility",
  "save-base",
  "assign-staff",
  "remove-staff",
  "remove-support",
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
  "remove-jury",
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
  "add-power",
  "deliver-powers",
  "void-power",
  "revert-power-use",
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
    case "captains-visibility":
      await setCaptainsVisibilityAs(actor, id, formText(form, "visible") === "1");
      return null;
    case "clear-captains":
      await clearCaptainsAs(actor, id);
      return null;
    case "standings-visibility":
      await setStandingsVisibilityAs(actor, id, formText(form, "visible") === "1");
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
    case "remove-support":
      await removeSupportAs(actor, id, cuid.parse(formText(form, "supportId")));
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
    case "remove-jury":
      await removeJuryScoresAs(actor, id, {
        extraId: formText(form, "extraId"),
        judge: formText(form, "judge"),
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
    case "add-power":
      await addPowerGrantAs(actor, id, {
        teamId: formText(form, "teamId"),
        power: z.enum(POWER_TYPES).parse(formText(form, "power")),
        day: Number(formText(form, "day")),
        delivered: checkbox(form, "delivered"),
      });
      return null;
    case "deliver-powers":
      // Repetir la orden no cambia nada: solo se entregan las que faltaban.
      await deliverPowerGrantsAs(actor, id, {
        day: Number(formText(form, "day")),
        teamId: formOptional(form, "teamId"),
        grantId: formOptional(form, "grantId"),
      });
      return null;
    case "void-power":
      await voidPowerGrantAs(actor, id, {
        grantId: formText(form, "grantId"),
        reason: formText(form, "reason"),
      });
      return null;
    case "revert-power-use":
      await revertPowerUseAs(actor, id, {
        useId: formText(form, "useId"),
        reason: formText(form, "reason"),
      });
      return null;
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

const JUDGE_POWER_OPERATIONS = ["declare", "withdraw", "start"] as const;

/** Poderes en la pantalla del juez (ADR-098, ADR-106): registrar la tarjeta que le entregan, quitarla
 *  antes de confirmar y confirmar los poderes (la operación `start`). El dominio limita a su base y
 *  comprueba cada regla; la vuelta es a su pantalla, al enfrentamiento. */
export async function judgePowerAction(form: FormData): Promise<void> {
  const competitionId = cuid.safeParse(formText(form, "competitionId"));
  if (!competitionId.success) redirect("/admin");
  const base = `/admin/the-games/${competitionId.data}/juez`;
  const access = await requireCompetitionStaff(competitionId.data, base);
  const matchupId = formText(form, "matchupId");
  const query = new URLSearchParams();
  try {
    const operation = z.enum(JUDGE_POWER_OPERATIONS).parse(formText(form, "operation"));
    const actor = await access.commandActor();
    if (operation === "declare") {
      const power = z.enum(POWER_TYPES).parse(formText(form, "power"));
      await declarePowerAs(actor, competitionId.data, {
        matchupId,
        teamId: formText(form, "teamId"),
        power,
      });
      query.set(
        "aviso",
        t("T-3115", {
          poder: tList("T-3040")[POWER_TYPES.indexOf(power)] ?? power,
          equipo: formText(form, "teamName"),
        }),
      );
    } else if (operation === "withdraw") {
      await revertPowerUseAs(actor, competitionId.data, { useId: formText(form, "useId") });
      query.set("aviso", t("T-3116"));
    } else {
      await startMatchupAs(actor, competitionId.data, matchupId);
      query.set("aviso", t("T-3117"));
    }
  } catch (error) {
    if (error instanceof DomainError) query.set("error", error.message);
    else if (error instanceof z.ZodError) query.set("error", t("T-260"));
    else throw error;
  }
  const anchor = cuid.safeParse(matchupId).success ? `#m-${matchupId}` : "";
  redirect(`${base}?${query}${anchor}`);
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

/** Carga los capitanes pegando tres columnas de la hoja de la OE (ADR-095). Si no se guarda, devuelve
 *  los problemas y lo pegado para corregirlo; si se guarda, vuelve a Equipos con el resumen, que solo
 *  lleva conteos. */
export async function importCaptainsAction(
  previous: ImportCaptainsState,
  form: FormData,
): Promise<ImportCaptainsState> {
  const competitionId = cuid.safeParse(formText(form, "competitionId"));
  if (!competitionId.success) return { ...previous, errors: [t("T-2764")] };
  const base = `/admin/the-games/${competitionId.data}`;
  const access = await requireCompetitionOperator(competitionId.data, `${base}?area=equipos`);
  const state = { text: formRaw(form, "text"), attempt: previous.attempt + 1 };
  let result: Awaited<ReturnType<typeof importCaptainsAs>>;
  try {
    result = await importCaptainsAs(await access.commandActor(), competitionId.data, {
      text: state.text,
    });
  } catch (error) {
    if (error instanceof DomainError) return { ...state, errors: [error.message] };
    if (error instanceof z.ZodError) return { ...state, errors: [t("T-260")] };
    throw error;
  }
  if (!result.saved) return { ...state, errors: result.errors };
  revalidatePath(base);
  const query = new URLSearchParams({
    area: "equipos",
    aviso: t("T-3021", { capitanes: result.captains, equipos: result.teams }),
  });
  redirect(`${base}?${query}`);
}

/** Carga el reparto de poderes pegando tres columnas (ADR-098). Si no se guarda, devuelve los problemas
 *  y lo pegado para corregirlo; si se guarda, vuelve a Poderes con el resumen. */
export async function importPowersAction(
  previous: ImportPowersState,
  form: FormData,
): Promise<ImportPowersState> {
  const competitionId = cuid.safeParse(formText(form, "competitionId"));
  if (!competitionId.success) return { ...previous, errors: [t("T-2764")] };
  const base = `/admin/the-games/${competitionId.data}`;
  const access = await requireCompetitionOperator(competitionId.data, `${base}?area=poderes`);
  const state = { text: formRaw(form, "text"), attempt: previous.attempt + 1 };
  let result: Awaited<ReturnType<typeof importPowerGrantsAs>>;
  try {
    result = await importPowerGrantsAs(await access.commandActor(), competitionId.data, {
      text: state.text,
    });
  } catch (error) {
    if (error instanceof DomainError) return { ...state, errors: [error.message] };
    if (error instanceof z.ZodError) return { ...state, errors: [t("T-260")] };
    throw error;
  }
  if (!result.saved) return { ...state, errors: result.errors };
  revalidatePath(base);
  const query = new URLSearchParams({
    area: "poderes",
    aviso: t("T-3068", { tarjetas: result.grants, equipos: result.teams }),
  });
  redirect(`${base}?${query}`);
}

/** La revisión del personal como la muestra la pantalla: cada base con sus cuatro funciones. */
function staffPreviewState(
  result: Awaited<ReturnType<typeof importStaffSheetAs>>,
  day: 1 | 2,
): StaffPreviewState | null {
  if (!result.preview) return null;
  const [lider, calificador, veedores, vars] = tList("T-3155");
  const empty = t("T-3159");
  const names = (items: string[]) => (items.length > 0 ? items.join(", ") : empty);
  const { summary } = result;
  return {
    summary: t("T-3130", {
      bases: summary.bases,
      lideres: summary.leaders,
      calificadores: summary.graders,
      veedores: summary.overseers,
      var: summary.vars,
    }),
    changes: t("T-3131", { entran: summary.added, salen: summary.removed, siguen: summary.kept }),
    warnings: result.preview.warnings,
    partial: result.preview.partial,
    removals: result.preview.removals,
    bases: result.preview.bases.map((base) => ({
      name: base.name,
      location: base.location,
      roles: [
        { label: lider ?? "", names: names(base.leaders) },
        { label: calificador ?? "", names: names(base.graders) },
        { label: veedores ?? "", names: names(base.overseers) },
        { label: vars ?? "", names: names(base.vars) },
      ],
    })),
    canSave: summary.added > 0 || summary.removed > 0,
    save: t("T-3129", { dia: dayName(day) }),
  };
}

/** Revisa o guarda el personal de una jornada desde la hoja del GAP (ADR-101). Revisar devuelve la
 *  revisión con su huella; guardar la exige y vuelve a Personal con el resumen, sin nombres en la
 *  dirección. */
export async function importStaffAction(
  previous: ImportStaffState,
  form: FormData,
): Promise<ImportStaffState> {
  const competitionId = cuid.safeParse(formText(form, "competitionId"));
  if (!competitionId.success) return { ...previous, errors: [t("T-2764")] };
  const base = `/admin/the-games/${competitionId.data}`;
  const access = await requireCompetitionOperator(competitionId.data, `${base}?area=personal`);
  const day = formText(form, "day") === "2" ? 2 : 1;
  const apply = formText(form, "intent") === "apply";
  const state: ImportStaffState = {
    attempt: previous.attempt + 1,
    day: day === 2 ? "2" : "1",
    text: formRaw(form, "text"),
    errors: [],
    notice: null,
    fingerprint: null,
    preview: null,
  };
  let result: Awaited<ReturnType<typeof importStaffSheetAs>>;
  try {
    result = await importStaffSheetAs(await access.commandActor(), competitionId.data, {
      day,
      text: state.text,
      fingerprint: apply ? formText(form, "fingerprint") || null : null,
    });
  } catch (error) {
    if (error instanceof DomainError) return { ...state, errors: [error.message] };
    if (error instanceof z.ZodError) return { ...state, errors: [t("T-260")] };
    throw error;
  }
  if (result.errors.length > 0) return { ...state, errors: result.errors };
  if (result.saved) {
    revalidatePath(base);
    const aviso = result.unchanged
      ? t("T-3140")
      : t("T-3139", {
          dia: dayName(day),
          lideres: result.summary.leaders,
          apoyo: result.summary.graders + result.summary.overseers + result.summary.vars,
          bases: result.summary.bases,
        });
    redirect(`${base}?${new URLSearchParams({ area: "personal", aviso })}`);
  }
  return {
    ...state,
    fingerprint: result.fingerprint,
    notice: result.stale ? t("T-3138") : null,
    preview: staffPreviewState(result, day),
  };
}

/** Carga las notas de un jurado de The Challenge (ADR-103). Si no se guarda, devuelve los problemas
 *  y lo pegado para corregirlo; si se guarda, vuelve a Extras con el resumen. */
export async function importJuryAction(
  previous: ImportJuryState,
  form: FormData,
): Promise<ImportJuryState> {
  const competitionId = cuid.safeParse(formText(form, "competitionId"));
  if (!competitionId.success) return { ...previous, errors: [t("T-2764")] };
  const base = `/admin/the-games/${competitionId.data}`;
  const access = await requireCompetitionOperator(competitionId.data, `${base}?area=extras`);
  const state = {
    judge: formText(form, "judge"),
    text: formRaw(form, "text"),
    attempt: previous.attempt + 1,
  };
  let result: Awaited<ReturnType<typeof importJuryScoresAs>>;
  try {
    result = await importJuryScoresAs(await access.commandActor(), competitionId.data, {
      extraId: formText(form, "extraId"),
      judge: state.judge,
      text: state.text,
    });
  } catch (error) {
    if (error instanceof DomainError) return { ...state, errors: [error.message] };
    if (error instanceof z.ZodError) return { ...state, errors: [t("T-260")] };
    throw error;
  }
  if (!result.saved) return { ...state, errors: result.errors };
  revalidatePath(base);
  const query = new URLSearchParams({
    area: "extras",
    aviso: t("T-3168", { jurado: result.judge, equipos: result.teams }),
  });
  redirect(`${base}?${query}`);
}
