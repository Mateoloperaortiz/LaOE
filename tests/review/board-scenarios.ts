import { randomBytes } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { event } from "@/modules/events/schema";
import {
  approveBudgetAs,
  decideEventApprovalAs,
  openBudgetAs,
  requestEventApprovalAs,
  setBudgetLinesAs,
} from "@/modules/finance";
import { createBudgetAs } from "@/modules/finance/domain/commands";
import {
  createItemAs,
  readCatalog,
  requestLoanApprovalAs,
  setReservationGrantAs,
} from "@/modules/inventory";
import { listLogisticsSources } from "@/modules/people";
import { person } from "@/modules/people/schema";
import { workGroup } from "@/modules/permanence/schema";
import { APP_TIME_ZONE, addDays, atHourIn, dateKeyIn } from "@/shared/lib/dates-pure";
import {
  currentTermCode,
  seedAppointment,
  seedCommittee,
  seedCommitteeMembership,
  seedConfig,
  seedConsent,
  seedCredential,
  seedEdition,
  seedEvent,
  seedMacroeventDirector,
  seedMember,
  seedOccasion,
  seedPermission,
  seedTerm,
  seedWorkGroup,
  seedWorkGroupMembership,
} from "../factories";
import { TEST_POLICY_VERSION } from "../factories/policy-version";

const roles = {
  president: "Presidencia",
  administrative: "VP Administrativa",
  communications: "VP de Comunicaciones",
  humanResources: "VP de Gestión Humana",
  finance: "VP Financiera",
  general: "Dirección General del comité",
  treasurer: "Dirección Financiera del comité",
  marketing: "Dirección de Mercadeo del comité",
  logistics: "Dirección Logística del comité",
  committeeHr: "Dirección de GH del comité",
  ccm: "Integrante del CCM",
  cml: "Integrante del CML",
  inventiva: "Dirección de GH de INVENTIVA",
  dias: "Dirección de GH de DÍAS",
  candidate: "Miembro nuevo postulante",
  member: "Miembro del comité",
  support: "Operación de soporte",
} as const;
const actor = (personId: string) => ({ personId, ip: null });

async function reviewer(key: keyof typeof roles, previousTerm: string) {
  const label = roles[key],
    email = `${key.toLowerCase()}@junta.example`,
    password = randomBytes(18).toString("base64url");
  const id = await seedMember(email, {
    firstName: label,
    lastName: "de ensayo",
    source: "BOARD_REVIEW",
    ...(key === "candidate" ? {} : { entryTermCode: previousTerm }),
  });
  await seedCredential(id, password);
  await seedConsent(id);
  return { key, label, id, email, password };
}

async function workCommittee(termId: string, code: "CCM" | "CML", leader: string, member: string) {
  const [existing] = await getDb()
    .select({ id: workGroup.id })
    .from(workGroup)
    .where(
      and(
        eq(workGroup.termId, termId),
        eq(workGroup.kind, "WORK_COMMITTEE"),
        eq(workGroup.code, code),
      ),
    );
  const id =
    existing?.id ??
    (await seedWorkGroup(termId, `${code} de ensayo`, {
      kind: "WORK_COMMITTEE",
      code,
      leaderPersonId: leader,
    }));
  await seedWorkGroupMembership(id, member);
}

/** Actores y casos ficticios comunes al ensayo de la Junta y a su verificación. La base la crea el lanzador. */
export async function prepareBoardScenarios() {
  const day = dateKeyIn(APP_TIME_ZONE, new Date()),
    year = Number(day.slice(0, 4)),
    termCode = currentTermCode(),
    termId = await seedTerm(termCode);
  const previous = termCode.endsWith("-2") ? `${year}-1` : `${year - 1}-2`;
  await seedConfig("privacy.policyVersion", TEST_POLICY_VERSION);
  const accounts: Array<Awaited<ReturnType<typeof reviewer>>> = [];
  for (const key of Object.keys(roles) as Array<keyof typeof roles>)
    accounts.push(await reviewer(key, previous));
  function who(key: keyof typeof roles) {
    const found = accounts.find((account) => account.key === key);
    if (!found) throw new Error(`Falta el cargo de ensayo ${key}`);
    return found.id;
  }

  for (const [key, seat] of [
    ["president", "PRESIDENT"],
    ["administrative", "VP_ADMIN"],
    ["communications", "VP_COMMUNICATIONS"],
    ["finance", "VP_FINANCE"],
    ["humanResources", "VP_GH"],
  ] as const) {
    await seedAppointment(who(key), termId, seat);
  }
  await seedPermission(who("support"), "ADMIN");
  const slug = "comite-ensayo-junta",
    committeeId = await seedCommittee(slug, "Comité de ensayo de la Junta");
  for (const [key, role] of [
    ["general", "GENERAL"],
    ["treasurer", "FINANCIERO"],
    ["marketing", "MERCADEO"],
    ["logistics", "LOGISTICA"],
    ["committeeHr", "GESTION_HUMANA"],
    ["member", "MIEMBRO"],
    ["candidate", "MIEMBRO"],
  ] as const) {
    await seedCommitteeMembership(who(key), committeeId, termId, role);
  }
  const cardUid = "A9 00 00 01";
  await getDb()
    .update(person)
    .set({ cardUid })
    .where(eq(person.id, who("logistics")));
  await workCommittee(termId, "CCM", who("communications"), who("ccm"));
  await workCommittee(termId, "CML", who("administrative"), who("cml"));
  const startDay = addDays(day, 1),
    endDay = addDays(startDay, 1);
  const start = atHourIn(APP_TIME_ZONE, startDay, 10),
    end = atHourIn(APP_TIME_ZONE, startDay, 11);
  for (const [key, slug, name] of [
    ["inventiva", "inventiva", "INVENTIVA"],
    ["dias", "dias-eafit", "DÍAS"],
  ] as const) {
    const [known] = await getDb().select({ id: event.id }).from(event).where(eq(event.slug, slug));
    const edition = await seedEdition(
      known?.id ?? (await seedEvent(slug, name)),
      "ensayo-junta",
      `${name} de ensayo`,
      { startsAt: start, endsAt: end, publicationStatus: "PUBLISHED" },
    );
    await seedMacroeventDirector(who(key), termId, edition, "GESTION_HUMANA");
    await seedOccasion(termId, {
      editionId: edition,
      title: `Ensayo de ${name}`,
      kind: "EDITION_SESSION",
      status: "DRAFT",
      startsAt: start,
      endsAt: end,
    });
  }
  await seedOccasion(termId, {
    committeeId,
    title: "Planeación del comité de ensayo",
    startsAt: start,
    endsAt: end,
  });
  const operator = actor(who("support"));
  const { id: budgetId } = await createBudgetAs(operator, { committeeId, year });
  await setBudgetLinesAs(operator, budgetId, {
    lines: [
      { name: "Escenario", assigned: 600000 },
      { name: "Materiales", assigned: 200000 },
    ],
  });
  for (const approver of ["STUDENT_DEVELOPMENT", "VP_FINANCE"] as const)
    await approveBudgetAs(operator, budgetId, { approver, on: day });
  await openBudgetAs(operator, budgetId);
  const { id: extraId } = await createBudgetAs(operator, {
    committeeId,
    year,
    kind: "EXTRAORDINARY",
    title: "Taller adicional de ensayo",
    submittedOn: day,
  });
  await setBudgetLinesAs(operator, extraId, { lines: [{ name: "Taller", assigned: 100000 }] });
  const eventInput = {
    committeeId,
    eventOn: startDay,
    riskLevel: "GREEN" as const,
    riskJustification: "Ensayo interno del comité, con aforo limitado.",
  };
  // El aval de materiales ya tiene su evento. La Presidencia conserva otro expediente por decidir.
  const eventApproval = await requestEventApprovalAs(actor(who("general")), {
    ...eventInput,
    title: "Jornada del comité de ensayo",
  });
  await decideEventApprovalAs(actor(who("president")), eventApproval.id, { decision: "APPROVED" });
  const pendingEvent = await requestEventApprovalAs(actor(who("general")), {
    ...eventInput,
    title: "Encuentro pendiente de Presidencia",
  });
  const manager = actor(who("administrative"));
  const item = await createItemAs(manager, {
    name: "Extensiones de ensayo",
    mode: "QUANTITY",
    total: 4,
    location: "Bodega ficticia",
    box: "A9",
  });
  const [source] = await listLogisticsSources(who("logistics"));
  if (!source) throw new Error("Falta el cargo de Logística del ensayo.");
  const ref = { sourceKind: source.kind, sourceId: source.id };
  await setReservationGrantAs(manager, { ...ref, enabled: true });
  const pickup = new Date((Math.floor(Date.now() / 60000) + 1) * 60000);
  const loan = await requestLoanApprovalAs(actor(who("logistics")), {
    ...ref,
    id: createId(),
    purpose: "COMMITTEE_EVENT",
    eventApprovalId: eventApproval.id,
    title: "Jornada del comité de ensayo",
    eventStartsOn: startDay,
    eventEndsOn: endDay,
    startsAt: pickup.toISOString(),
    minutes: "Acta sintética de Logística A9, punto 2.",
    lateReason: "La confirmación del escenario llegó esta semana.",
    lines: [{ itemId: item.id, quantity: 2 }],
  });
  const material = (await readCatalog()).find((row) => row.id === item.id);
  if (!material) throw new Error("Falta la etiqueta del material.");
  return {
    accounts,
    termCode,
    day,
    startDay,
    endDay,
    returnDay: addDays(endDay, 5),
    pickup: pickup.toISOString(),
    cardUid,
    barcode: material.barcode,
    slug,
    committeeId,
    budgetId,
    extraId,
    eventId: pendingEvent.id,
    approvedEventId: eventApproval.id,
    loanId: loan.id,
  };
}
