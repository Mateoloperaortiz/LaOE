import { createId } from "@paralleldrive/cuid2";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import {
  addSpaceAs,
  decideSpaceAs,
  requestSpaceAs,
  setSpaceActiveAs,
  spaceBookingsFor,
} from "@/modules/inventory";
import {
  reportConflictAs,
  reportedConflictsFor,
  resolveConflictAs,
  weeklyScheduleConflicts,
} from "@/modules/participation";
import { listLogisticsSources } from "@/modules/people";
import {
  seedAppointment,
  seedCommittee,
  seedCommitteeMembership,
  seedEdition,
  seedEvent,
  seedMacroeventDirector,
  seedMember,
  seedOccasion,
  seedTerm,
} from "../factories";
import { truncateAll } from "./db";

const now = new Date("2026-09-16T14:00:00Z");
const start = new Date("2026-09-18T14:00:00Z"),
  end = new Date("2026-09-18T15:00:00Z");
const actor = (personId: string) => ({ personId, ip: null });
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  await truncateAll();
});
afterEach(() => vi.useRealTimers());
afterAll(closeDb);

it("Logística pide sin concesión de bodega y la VP serializa el uso de un mismo espacio", async () => {
  const term = await seedTerm("2026-2"),
    committee = await seedCommittee("a8-sala");
  const vp = await seedMember("a8-vp@eafit.edu.co"),
    dir = await seedMember("a8-log@eafit.edu.co"),
    other = await seedMember("a8-otro@eafit.edu.co");
  await seedAppointment(vp, term, "VP_ADMIN");
  await seedCommitteeMembership(dir, committee, term, "LOGISTICA");
  const [source] = await listLogisticsSources(dir);
  if (!source) throw Error("Falta Logística");
  await expect(addSpaceAs(actor(other), "Sala de ensayo")).rejects.toThrow();
  expect(() => addSpaceAs(actor(vp), "La valla")).toThrow();
  const spaceId = await addSpaceAs(actor(vp), "Sala de ensayo");
  expect(await addSpaceAs(actor(vp), "SALA DE ENSAYO")).toBe(spaceId);
  const input = {
    id: createId(),
    spaceId,
    sourceId: source.id,
    sourceKind: source.kind,
    startsAt: start,
    endsAt: end,
    purpose: "Ensayo sintético",
  };
  await expect(requestSpaceAs(actor(other), input)).rejects.toThrow();
  expect(await requestSpaceAs(actor(dir), input)).toBe(input.id);
  expect(await requestSpaceAs(actor(dir), input)).toBe(input.id);
  const second = await requestSpaceAs(actor(dir), { ...input, id: createId() });
  const decisions = await Promise.allSettled(
    [input.id, second].map((id) => decideSpaceAs(actor(vp), id, { decision: "APPROVED" })),
  );
  expect(decisions.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
  const rows = await spaceBookingsFor(dir);
  const approved = rows.find((r) => r.status === "APPROVED"),
    pending = rows.find((r) => r.status === "PENDING");
  if (!approved || !pending) throw Error("Faltan las dos solicitudes");
  await decideSpaceAs(actor(vp), approved.id, { decision: "APPROVED" });
  expect(() => decideSpaceAs(actor(vp), pending.id, { decision: "REJECTED" })).toThrow();
  await decideSpaceAs(actor(vp), pending.id, {
    decision: "REJECTED",
    note: "La sala ya está ocupada",
  });
  expect(await spaceBookingsFor(other)).toHaveLength(0);
  const next = await requestSpaceAs(actor(dir), {
    ...input,
    id: createId(),
    startsAt: end,
    endsAt: new Date(+end + 3600000),
  });
  await decideSpaceAs(actor(vp), next, { decision: "APPROVED" });
  await setSpaceActiveAs(actor(vp), spaceId, false);
  await expect(requestSpaceAs(actor(dir), { ...input, id: createId() })).rejects.toThrow();
  expect((await spaceBookingsFor(dir)).filter((r) => r.status === "APPROVED")).toHaveLength(2);
});

it("los cruces sin acuerdo van a GH entre macroeventos y a Administrativa con un comité", async () => {
  const term = await seedTerm("2026-2");
  const vp = await seedMember("agenda-adm@eafit.edu.co"),
    gh = await seedMember("agenda-gh@eafit.edu.co"),
    director = await seedMember("agenda-direccion@eafit.edu.co"),
    peer = await seedMember("agenda-par@eafit.edu.co"),
    outsider = await seedMember("agenda-otra@eafit.edu.co");
  await seedAppointment(vp, term, "VP_ADMIN");
  await seedAppointment(gh, term, "VP_GH");
  const editions = await Promise.all(
    ["inventiva", "dias-eafit"].map(async (slug) =>
      seedEdition(await seedEvent(slug, slug), slug + "-26", slug),
    ),
  );
  const [a, b] = editions;
  if (!a || !b) throw Error("Faltan ediciones");
  await seedMacroeventDirector(director, term, a, "GESTION_HUMANA");
  await seedMacroeventDirector(peer, term, b, "GESTION_HUMANA");
  const committee = await seedCommittee("a8-plan");
  const logistics = await seedMember("agenda-logistica@eafit.edu.co");
  await seedCommitteeMembership(logistics, committee, term, "LOGISTICA");
  for (const [edition, title] of [
    [a, "Plan Inventiva"],
    [b, "Plan DÍAS"],
  ] as const)
    await seedOccasion(term, {
      kind: "EDITION_SESSION",
      editionId: edition,
      title,
      status: "DRAFT",
      startsAt: start,
      endsAt: end,
    });
  await seedOccasion(term, {
    committeeId: committee,
    title: "Plan de comité",
    startsAt: start,
    endsAt: end,
  });
  await seedOccasion(term, {
    title: "Comienza al terminar",
    startsAt: end,
    endsAt: new Date(+end + 3600000),
  });
  const day = "2026-09-14";
  const pairs = await weeklyScheduleConflicts(director, day);
  expect(pairs).toHaveLength(2);
  expect(await weeklyScheduleConflicts(outsider, day)).toHaveLength(0);
  for (const pair of pairs) {
    const isMacro = pair.firstTitle.includes("Plan") && pair.secondTitle.includes("Plan");
    expect(pair.seat).toBe(isMacro ? "VP_GH" : "VP_ADMIN");
    const report = {
      day,
      pairKey: pair.pairKey,
      attempts: "Las direcciones revisaron dos horarios sin acordar uno.",
    };
    await expect(reportConflictAs(actor(outsider), report)).rejects.toThrow();
    const results = await Promise.all([
      reportConflictAs(actor(director), report),
      reportConflictAs(actor(director), report),
    ]);
    const id = results[0];
    expect(results[1]).toBe(id);
    await expect(
      resolveConflictAs(actor(isMacro ? vp : gh), id, "Cambiar el horario"),
    ).rejects.toThrow();
    await resolveConflictAs(actor(isMacro ? gh : vp), id, "El segundo equipo moverá su reunión.");
    await resolveConflictAs(actor(isMacro ? gh : vp), id, "El segundo equipo moverá su reunión.");
    expect((await reportedConflictsFor(peer)).some((r) => r.id === id)).toBe(isMacro);
    if (!isMacro) {
      const [theirs] = await reportedConflictsFor(logistics);
      expect(theirs?.id).toBe(id);
      expect([theirs?.firstTitle, theirs?.secondTitle]).toContain("Plan de comité");
      const [decision] = await reportedConflictsFor(vp);
      expect([decision?.firstTitle, decision?.secondTitle]).toContain("Plan de comité");
    }
  }
  expect(await reportedConflictsFor(outsider)).toHaveLength(0);
  expect((await reportedConflictsFor(director)).filter((r) => r.resolvedAt)).toHaveLength(2);
});
