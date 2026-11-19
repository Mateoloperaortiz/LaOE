import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  creativeMentoringFor,
  leaveCreativeFeedbackAs,
  publishCreativeAs,
  verifyHistoricalFeedAs,
} from "@/modules/comms";
import { creativeApproval } from "@/modules/comms/schema";
import { listMarketingDirectors } from "@/modules/people";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedTerm,
  seedWorkGroup,
  seedWorkGroupMembership,
} from "../factories";
import { seedCreativePiece } from "../factories/creative";
import { truncateAll } from "./db";

beforeEach(truncateAll);
afterAll(closeDb);
it("cada nombramiento tiene sus tres publicaciones, el CCM comenta una vez y se verifica el histórico", async () => {
  const now = new Date("2026-09-13T15:00:00Z");
  const term = await seedTerm("2026-2");
  const committee = await seedCommittee("mercadeo-prueba", "Mercadeo de prueba");
  const one = await seedMember("director-uno@eafit.edu.co");
  const two = await seedMember("director-dos@eafit.edu.co");
  const mentor = await seedMember("mentor@eafit.edu.co");
  const outsider = await seedMember("otra-persona@eafit.edu.co");
  await seedCommitteeMembership(one, committee, term, "MERCADEO");
  await seedCommitteeMembership(two, committee, term, "MERCADEO", { coDirector: true });
  const group = await seedWorkGroup(term, "CCM de prueba", { kind: "WORK_COMMITTEE", code: "CCM" });
  await seedWorkGroupMembership(group, mentor);
  const directors = await listMarketingDirectors(committee, term);
  async function piece(personId: string, index: number, legacy = false) {
    const director = directors.find((row) => row.personId === personId);
    if (!director) throw new Error("Falta Mercadeo");
    const id = createId();
    const at = new Date(now.getTime() + index * 1000);
    await seedCreativePiece({
      id,
      committeeId: committee,
      title: "Cartel de prueba",
      channel: "Instagram",
      fileName: "pieza.png",
      digest: "a".repeat(64),
      status: "APPROVED",
      decidedAt: now,
      decidedAs: "HOLDER",
      marketingAssignmentId: legacy ? null : director.id,
      marketingTermId: legacy ? null : term,
      marketingDirectorId: legacy ? null : personId,
      channelVerified: !legacy,
    });
    await publishCreativeAs({ personId: two, ip: null }, committee, id, at);
    await publishCreativeAs({ personId: two, ip: null }, committee, id, at);
    return id;
  }
  const historical = await piece(one, 0, true);
  const first = await piece(one, 1);
  await piece(two, 2);
  await piece(one, 3);
  const fourth = await piece(one, 4);
  expect((await creativeMentoringFor(mentor, now)).pieces).toHaveLength(4);
  await verifyHistoricalFeedAs(
    { personId: one, ip: null },
    committee,
    historical,
    directors.find((row) => row.personId === one)?.id ?? "",
  );
  const followed = await creativeMentoringFor(one, now);
  expect(followed.pieces.map((row) => row.id)).toContain(historical);
  expect(followed.pieces.map((row) => row.id)).not.toContain(fourth);
  expect((await creativeMentoringFor(outsider, now)).pieces).toHaveLength(0);
  const note = { id: createId(), pieceId: first, body: "Revisa el margen del título." };
  const write = (personId: string) => leaveCreativeFeedbackAs({ personId, ip: null }, note, now);
  await expect(write(outsider)).rejects.toThrow();
  await write(mentor);
  await write(mentor);
  expect(
    (await creativeMentoringFor(one, now)).pieces.find((row) => row.id === first)?.notes,
  ).toHaveLength(1);
  await getDb().delete(creativeApproval).where(eq(creativeApproval.id, fourth));
});
