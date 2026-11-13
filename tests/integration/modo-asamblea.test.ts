import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  createPollAs,
  listPendingVotes,
  listPolls,
  listPollsForMember,
  setPollStatusAs,
  votePollAs,
} from "@/modules/participation";
import { assemblyVoter } from "@/modules/participation/schema";
import { t } from "@/shared/copy";
import { seedCheckIn, seedMember, seedOccasion, seedTerm } from "../factories";
import { truncateAll } from "./db";

// El modo asamblea (ADR-180): vota quien está presente, una vez; una sola consulta abierta por
// asamblea; y en una secreta el padrón no guarda la opción y los resultados salen al cerrar.

const actor = (personId: string) => ({ personId, ip: null });

beforeEach(truncateAll);
afterAll(() => closeDb());

async function assemblyWith(present: string[]) {
  const termId = await seedTerm();
  const { id } = await seedOccasion(termId, {
    title: "Asamblea ordinaria",
    kind: "ASSEMBLY",
    assemblyKind: "ORDINARY",
    points: 0,
  });
  for (const personId of present) await seedCheckIn(id, personId, "APPROVED");
  return id;
}

describe("modo asamblea", () => {
  it("quien está presente vota una vez; quien no, no; y los resultados se ven en una consultiva", async () => {
    const ana = await seedMember("ana.asamblea@eafit.edu.co");
    const beto = await seedMember("beto.asamblea@eafit.edu.co");
    const ausente = await seedMember("ausente.asamblea@eafit.edu.co");
    const occasionId = await assemblyWith([ana, beto]);
    const { id: pollId } = await createPollAs(actor(ana), {
      occasionId,
      question: "¿Cambiamos la hora de la reunión?",
      options: ["Sí", "No"],
      secret: false,
    });

    await expect(votePollAs(actor(ana), pollId, 0)).rejects.toThrow(t("T-4997"));
    await setPollStatusAs(actor(ana), pollId, "OPEN");
    expect(await listPendingVotes(beto)).toEqual([
      { occasionId, occasionTitle: "Asamblea ordinaria" },
    ]);
    await votePollAs(actor(ana), pollId, 0);
    await votePollAs(actor(beto), pollId, 1);
    await expect(votePollAs(actor(ana), pollId, 1)).rejects.toThrow(t("T-4996"));
    await expect(votePollAs(actor(ausente), pollId, 0)).rejects.toThrow(t("T-4995"));

    const [poll] = await listPolls(occasionId);
    expect(poll?.voters).toBe(2);
    expect(poll?.results?.map((item) => item.votes)).toEqual([1, 1]);
    expect(await listPendingVotes(beto)).toEqual([]);
    expect((await listPollsForMember(ana, occasionId)).polls[0]?.voted).toBe(true);
  });

  it("una secreta no guarda la opción de nadie y sus resultados salen al cerrar", async () => {
    const ana = await seedMember("ana.secreta@eafit.edu.co");
    const beto = await seedMember("beto.secreta@eafit.edu.co");
    const occasionId = await assemblyWith([ana, beto]);
    const { id: pollId } = await createPollAs(actor(ana), {
      occasionId,
      question: "Elección de la junta",
      options: ["Plancha 1", "Plancha 2", "En blanco"],
      secret: true,
    });
    await setPollStatusAs(actor(ana), pollId, "OPEN");
    await votePollAs(actor(ana), pollId, 1);
    await votePollAs(actor(beto), pollId, 1);

    const voters = await getDb()
      .select({ optionIndex: assemblyVoter.optionIndex })
      .from(assemblyVoter)
      .where(eq(assemblyVoter.pollId, pollId));
    expect(voters).toEqual([{ optionIndex: null }, { optionIndex: null }]);
    expect((await listPolls(occasionId))[0]).toMatchObject({ voters: 2, results: null });

    await setPollStatusAs(actor(ana), pollId, "CLOSED");
    expect((await listPolls(occasionId))[0]?.results?.map((item) => item.votes)).toEqual([0, 2, 0]);
  });

  it("una sola consulta abierta por asamblea, y las opciones dentro del rango", async () => {
    const ana = await seedMember("ana.abierta@eafit.edu.co");
    const occasionId = await assemblyWith([ana]);
    const first = await createPollAs(actor(ana), {
      occasionId,
      question: "Primera pregunta",
      options: ["A", "B"],
      secret: false,
    });
    const second = await createPollAs(actor(ana), {
      occasionId,
      question: "Segunda pregunta",
      options: ["A", "B"],
      secret: false,
    });
    await setPollStatusAs(actor(ana), first.id, "OPEN");

    await expect(setPollStatusAs(actor(ana), second.id, "OPEN")).rejects.toThrow(t("T-4998"));
    await expect(
      createPollAs(actor(ana), {
        occasionId,
        question: "Sin opciones",
        options: ["Sola"],
        secret: false,
      }),
    ).rejects.toThrow(t("T-4994", { min: 2, max: 8 }));
  });
});
