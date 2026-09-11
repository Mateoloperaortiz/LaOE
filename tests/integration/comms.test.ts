import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { sendTransactionalEmail, setMailTransportsForTests } from "@/modules/comms";
import { message } from "@/modules/comms/schema";
import { membership, person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { type MailTransport, QuotaExceededError } from "@/shared/adapters/mail";
import { truncateAll } from "./db";

const db = () => getDb();

function fakeTransport(
  name: MailTransport["name"],
  behaviour: () => Promise<{ id: string | null }>,
): MailTransport {
  return { name, send: behaviour };
}

async function seedPerson(): Promise<string> {
  const [current] = await db()
    .insert(term)
    .values({ code: "2026-2", semester: 2, startsOn: "2026-07-13", endsOn: "2026-12-05" })
    .returning({ id: term.id });
  const [who] = await db()
    .insert(person)
    .values({
      email: "correo@eafit.edu.co",
      firstName: "Correo",
      lastName: "Prueba",
      stage: "MEMBER",
    })
    .returning({ id: person.id });
  if (!who || !current) throw new Error("seed");
  await db().insert(membership).values({ personId: who.id, firstTermId: current.id });
  return who.id;
}

describe("sendTransactionalEmail", () => {
  beforeEach(truncateAll);
  afterAll(async () => {
    setMailTransportsForTests(undefined);
    await closeDb();
  });

  it("registra el envío con el proveedor por el que salió", async () => {
    const personId = await seedPerson();
    setMailTransportsForTests({
      primary: fakeTransport("resend", async () => ({ id: "re_1" })),
      overflow: null,
    });
    const receipt = await sendTransactionalEmail({
      personId,
      to: "correo@eafit.edu.co",
      subject: "Hola",
      text: "x",
    });
    expect(receipt).toMatchObject({ status: "SENT", provider: "resend", providerId: "re_1" });
    const [row] = await db().select().from(message);
    expect(row).toMatchObject({ personId, channel: "EMAIL", provider: "resend", status: "SENT" });
  });

  it("desborda a SES solo por cuota y registra también los fallos del proveedor de respaldo", async () => {
    const personId = await seedPerson();
    setMailTransportsForTests({
      primary: fakeTransport("resend", async () => {
        throw new QuotaExceededError("daily_quota_exceeded");
      }),
      overflow: fakeTransport("ses", async () => ({ id: "ses_1" })),
    });
    const receipt = await sendTransactionalEmail({
      personId,
      to: "correo@eafit.edu.co",
      subject: "Hola",
      text: "x",
    });
    expect(receipt).toMatchObject({ status: "SENT", provider: "ses" });

    setMailTransportsForTests({
      primary: fakeTransport("resend", async () => {
        throw new Error("boom");
      }),
      overflow: fakeTransport("ses", async () => ({ id: "ses_2" })),
    });
    const failed = await sendTransactionalEmail({
      personId,
      to: "correo@eafit.edu.co",
      subject: "Hola",
      text: "x",
    });
    expect(failed).toMatchObject({ status: "FAILED", provider: "resend", error: "boom" });
    setMailTransportsForTests({
      primary: fakeTransport("resend", async () => {
        throw new QuotaExceededError("daily_quota_exceeded");
      }),
      overflow: fakeTransport("ses", async () => {
        throw new Error("SES no disponible");
      }),
    });
    expect(
      await sendTransactionalEmail({
        personId,
        to: "correo@eafit.edu.co",
        subject: "Hola",
        text: "x",
      }),
    ).toMatchObject({ status: "FAILED", provider: "ses", error: "SES no disponible" });
    const [failures] = await db()
      .select({ n: count() })
      .from(message)
      .where(eq(message.status, "FAILED"));
    expect(failures?.n).toBe(2);
  });

  it("sale por SES directamente cuando el contador del día llegó al límite", async () => {
    const personId = await seedPerson();
    let resendCalls = 0;
    setMailTransportsForTests({
      primary: fakeTransport("resend", async () => {
        resendCalls += 1;
        return { id: `re_${resendCalls}` };
      }),
      overflow: fakeTransport("ses", async () => ({ id: "ses" })),
    });
    const limit = Number(process.env.RESEND_DAILY_LIMIT ?? 95);
    for (let i = 0; i < limit; i += 1) {
      await sendTransactionalEmail({
        personId,
        to: "correo@eafit.edu.co",
        subject: `n${i}`,
        text: "x",
      });
    }
    const extra = await sendTransactionalEmail({
      personId,
      to: "correo@eafit.edu.co",
      subject: "extra",
      text: "x",
    });
    expect(resendCalls).toBe(limit);
    expect(extra.provider).toBe("ses");
  });
});
