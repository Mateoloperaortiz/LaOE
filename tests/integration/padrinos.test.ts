import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand } from "@/db/tx";
import { mentorshipsFor } from "@/modules/people";
import { anonymizePerson } from "@/modules/people/domain/membership";
import {
  assignMentorAs,
  MENTEES_PER_MENTOR,
  removeMentorship,
} from "@/modules/people/domain/mentorship";
import { mentorship, person } from "@/modules/people/schema";
import { outbox } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { seedMembership, seedPerson, seedTerm } from "../factories";
import { truncateAll } from "./db";

// Padrinos (ADR-185): a un nuevo del semestre, un veterano que participa o un egresado con acceso; uno
// por nuevo, hasta tres por padrino, y cada uno ve al otro en Mi OE.

beforeEach(truncateAll);
afterAll(() => closeDb());

const admin = { personId: null, ip: null };

async function setup() {
  const previous = await seedTerm("2026-1", { startsOn: "2026-01-19", endsOn: "2026-06-05" });
  const current = await seedTerm("2026-2", {
    startsOn: "2026-07-13",
    endsOn: "2026-12-05",
  });
  async function member(
    email: string,
    firstTermId: string,
    status: "ACTIVE" | "HONORARY" = "ACTIVE",
  ) {
    const id = await seedPerson(email, { firstName: email.split("@")[0] ?? "" });
    await seedMembership(id, firstTermId, status);
    return id;
  }
  async function alumnus(email: string, endReason: "GRADUATION" | "RESIGNATION") {
    const id = await seedPerson(email, { firstName: email.split("@")[0] ?? "", stage: "ALUMNI" });
    await seedMembership(id, previous, "INACTIVE", { endReason });
    return id;
  }
  return { previous, current, member, alumnus };
}

describe("padrinos", () => {
  it("un veterano o un egresado apadrinan a un nuevo, y cada uno ve al otro", async () => {
    const { previous, current, member, alumnus } = await setup();
    const nueva = await member("nueva@eafit.edu.co", current);
    const veterano = await member("veterano@eafit.edu.co", previous);
    const egresada = await alumnus("egresada@eafit.edu.co", "GRADUATION");

    await assignMentorAs(admin, { menteeId: nueva, mentorId: veterano });
    expect((await mentorshipsFor(nueva)).mentor).toMatchObject({
      personId: veterano,
      alumni: false,
    });
    expect((await mentorshipsFor(veterano)).mentees.map((item) => item.personId)).toEqual([nueva]);

    // Cambiar el padrino deja una sola relación para el nuevo.
    await assignMentorAs(admin, { menteeId: nueva, mentorId: egresada });
    expect((await mentorshipsFor(nueva)).mentor).toMatchObject({
      personId: egresada,
      alumni: true,
    });
    expect((await mentorshipsFor(veterano)).mentees).toEqual([]);
    expect(await getDb().select().from(mentorship)).toHaveLength(1);

    // Los dos reciben el aviso, que lleva a la página de padrinos.
    const avisos = await getDb()
      .select()
      .from(outbox)
      .where(eq(outbox.eventType, "notification.requested"));
    const destinatarios = avisos.flatMap(
      (row) => (row.payload as { recipients: { personId: string }[] }).recipients,
    );
    expect(destinatarios.map((item) => item.personId)).toEqual(
      expect.arrayContaining([nueva, veterano, egresada]),
    );
  });

  it("solo un nuevo tiene padrino, y no apadrina un nuevo ni quien renunció", async () => {
    const { previous, current, member, alumnus } = await setup();
    const nueva = await member("nueva2@eafit.edu.co", current);
    const otraNueva = await member("otra.nueva@eafit.edu.co", current);
    const veterano = await member("veterano2@eafit.edu.co", previous);
    const renuncio = await alumnus("renuncio@eafit.edu.co", "RESIGNATION");

    await expect(assignMentorAs(admin, { menteeId: veterano, mentorId: nueva })).rejects.toThrow(
      t("T-5010"),
    );
    await expect(assignMentorAs(admin, { menteeId: nueva, mentorId: otraNueva })).rejects.toThrow(
      t("T-5011"),
    );
    await expect(assignMentorAs(admin, { menteeId: nueva, mentorId: renuncio })).rejects.toThrow(
      t("T-5011"),
    );
    await expect(assignMentorAs(admin, { menteeId: nueva, mentorId: nueva })).rejects.toThrow(
      t("T-5011"),
    );
  });

  it("un padrino acompaña a lo sumo a tres nuevos por semestre", async () => {
    const { previous, current, member } = await setup();
    const veterano = await member("padrino@eafit.edu.co", previous, "HONORARY");
    const nuevos = [];
    for (let index = 0; index <= MENTEES_PER_MENTOR; index += 1) {
      nuevos.push(await member(`nuevo${index}@eafit.edu.co`, current));
    }
    for (const nuevo of nuevos.slice(0, MENTEES_PER_MENTOR)) {
      await assignMentorAs(admin, { menteeId: nuevo, mentorId: veterano });
    }
    const ultimo = nuevos[MENTEES_PER_MENTOR] ?? "";
    await expect(assignMentorAs(admin, { menteeId: ultimo, mentorId: veterano })).rejects.toThrow(
      t("T-5012", { n: MENTEES_PER_MENTOR }),
    );
  });

  it("quitar la relación o anonimizar a uno de los dos la borra", async () => {
    const { previous, current, member } = await setup();
    const nueva = await member("nueva3@eafit.edu.co", current);
    const otra = await member("otra3@eafit.edu.co", current);
    const veterano = await member("veterano3@eafit.edu.co", previous);
    const { id } = await assignMentorAs(admin, { menteeId: nueva, mentorId: veterano });
    await assignMentorAs(admin, { menteeId: otra, mentorId: veterano });

    await runCommand(admin, (ctx) => removeMentorship(ctx, id));
    expect((await mentorshipsFor(nueva)).mentor).toBeNull();

    await getDb()
      .update(person)
      .set({ deletionRequestedAt: new Date() })
      .where(eq(person.id, veterano));
    await runCommand(admin, (ctx) => anonymizePerson(ctx, veterano));
    expect(await getDb().select().from(mentorship)).toEqual([]);
  });
});
