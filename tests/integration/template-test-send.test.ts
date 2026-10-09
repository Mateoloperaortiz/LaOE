import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sendTestFromCampaignAction } from "@/app/admin/campanas/[id]/actions";
import { sendTestAction } from "@/app/admin/plantillas/[id]/actions";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { sendTemplateTestAs, setMailTransportsForTests } from "@/modules/comms";
import { createTemplate } from "@/modules/comms/domain/templates";
import { message } from "@/modules/comms/schema";
import { auditLog } from "@/modules/system/schema";
import { truncateAll } from "./db";
import { seedMember } from "./factories";

// «Enviarme una prueba» de una plantilla y de una campaña (ADR-038 regla 8) responde con lo que el
// proveedor contestó (ADR-118 regla 14; DT-227): una prueba rechazada no dice «te la mandamos» ni
// queda auditada como enviada. Acá van el comando y las dos actions enteras, contra la base.

const session = vi.hoisted(() => ({ personId: "" }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/app/_lib/actor", () => ({
  actorContext: async () => ({ personId: session.personId, ip: null }),
}));
vi.mock("@/modules/identity", async (importOriginal) => {
  const admin = async () => ({
    personId: session.personId,
    membershipStatus: "ACTIVE",
    isAdmin: true,
    permissions: [{ code: "ADMIN", committeeId: null }],
  });
  return {
    ...(await importOriginal<typeof import("@/modules/identity")>()),
    getActor: admin,
    requireAdminActor: admin,
  };
});

const EMAIL = "admin.prueba@eafit.edu.co";

function provider(answer: "accepts" | "rejects"): void {
  setMailTransportsForTests({
    primary: {
      name: "resend",
      async send() {
        if (answer === "rejects") {
          throw new Error("Resend: 403 el dominio no está verificado");
        }
        return { id: "re_prueba" };
      },
    },
    overflow: null,
  });
}

async function seedTemplate(): Promise<string> {
  const { id } = await runCommand(SYSTEM_ACTOR, (ctx) =>
    createTemplate(ctx, {
      slug: "boletin-de-prueba",
      name: "Boletín de prueba",
      subject: "Novedades de la OE",
      body: "Hola. Este es el boletín.",
    }),
  );
  return id;
}

function sentAudits(templateId: string) {
  return getDb()
    .select({ after: auditLog.after })
    .from(auditLog)
    .where(and(eq(auditLog.action, "email-template.test-sent"), eq(auditLog.entityId, templateId)));
}

/** A dónde vuelve la action: la ruta y sus parámetros. */
async function comesBackTo(action: Promise<unknown>): Promise<URL> {
  try {
    await action;
  } catch (error) {
    const text = error instanceof Error ? error.message : "";
    if (text.startsWith("redirect:")) {
      return new URL(text.slice("redirect:".length), "http://local");
    }
    throw error;
  }
  throw new Error("la action no redirigió");
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

describe("enviarme una prueba de una plantilla", () => {
  beforeEach(async () => {
    await truncateAll();
    session.personId = await seedMember(EMAIL);
  });
  afterAll(async () => {
    setMailTransportsForTests(undefined);
    await closeDb();
  });

  it("la que el proveedor rechaza no responde como enviada ni queda auditada como enviada", async () => {
    const templateId = await seedTemplate();
    provider("rejects");

    const result = await sendTemplateTestAs({ personId: session.personId, ip: null }, templateId);

    expect(result).toEqual({ to: EMAIL, sent: false });
    expect(await sentAudits(templateId)).toEqual([]);
    // El rechazo sí queda donde ADMIN lo puede ver: el mensaje, con el motivo del proveedor.
    const messages = await getDb()
      .select({ status: message.status, error: message.error })
      .from(message)
      .where(eq(message.personId, session.personId));
    expect(messages).toEqual([
      { status: "FAILED", error: expect.stringContaining("el dominio no está verificado") },
    ]);
  });

  it("la que el proveedor acepta responde como enviada y queda auditada", async () => {
    const templateId = await seedTemplate();
    provider("accepts");

    const result = await sendTemplateTestAs({ personId: session.personId, ip: null }, templateId);

    expect(result).toEqual({ to: EMAIL, sent: true });
    expect(await sentAudits(templateId)).toEqual([{ after: { to: EMAIL } }]);
  });

  it.each([
    ["la plantilla", "/admin/plantillas/"],
    ["la campaña", "/admin/campanas/"],
  ])("la pantalla de %s no dice que mandó una prueba que el proveedor rechazó", async (_screen, base) => {
    const templateId = await seedTemplate();
    const fromTemplate = base === "/admin/plantillas/";
    const send = () =>
      fromTemplate
        ? sendTestAction(form({ templateId }))
        : sendTestFromCampaignAction(form({ campaignId: "campanasintetica", templateId }));
    const screen = `${base}${fromTemplate ? templateId : "campanasintetica"}`;

    provider("rejects");
    const rejected = await comesBackTo(send());
    expect(rejected.pathname).toBe(screen);
    expect(Object.fromEntries(rejected.searchParams)).toEqual({ pruebaRechazada: EMAIL });

    provider("accepts");
    const accepted = await comesBackTo(send());
    expect(accepted.pathname).toBe(screen);
    expect(Object.fromEntries(accepted.searchParams)).toEqual({ prueba: EMAIL });
  });
});
