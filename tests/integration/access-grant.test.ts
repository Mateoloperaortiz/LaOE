import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { SYSTEM_ACTOR } from "@/db/tx";
import { grantPermissionAs } from "@/modules/identity";
import {
  consumeAccessGrant,
  issueAccessGrantAs,
  resolveAccessGrant,
} from "@/modules/identity/domain/access-grant";
import { findPasswordHash, signInWithPassword } from "@/modules/identity/domain/password";
import { hashPassword, hashToken, verifyPassword } from "@/modules/identity/domain/pure";
import { createSession, resolveActor } from "@/modules/identity/domain/session";
import { accessGrant, credential, session } from "@/modules/identity/schema";
import { committee, membership, person } from "@/modules/people/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { truncateAll } from "./db";

// Enlace de un solo uso que emite la junta (ADR-051).

const db = () => getDb();
const CLAVE = "trapecio verde 41";

async function seedMember(
  email: string,
  status: "ACTIVE" | "INACTIVE" = "ACTIVE",
): Promise<string> {
  let [current] = await db().select({ id: term.id }).from(term).where(eq(term.code, "2026-2"));
  if (!current) {
    [current] = await db()
      .insert(term)
      .values({ code: "2026-2", semester: 2, startsOn: "2026-07-13", endsOn: "2026-12-05" })
      .returning({ id: term.id });
  }
  const [who] = await db()
    .insert(person)
    .values({ email, firstName: "Camila", lastName: "Sintética", stage: "MEMBER" })
    .returning({ id: person.id });
  if (!who || !current) throw new Error("seed");
  await db().insert(membership).values({ personId: who.id, status, firstTermId: current.id });
  return who.id;
}

async function seedCommittee(slug: string): Promise<string> {
  const [row] = await db()
    .insert(committee)
    .values({ slug, name: `Comité ${slug}` })
    .returning({ id: committee.id });
  if (!row) throw new Error("seed");
  return row.id;
}

/** Miembro activo con sus permisos técnicos, concedidos por el comando de permisos. */
async function seedMemberWith(
  email: string,
  ...grants: Array<"ADMIN" | "BOARD" | { leaderOf: string }>
): Promise<string> {
  const personId = await seedMember(email);
  for (const grant of grants) {
    await grantPermissionAs(
      SYSTEM_ACTOR,
      typeof grant === "string"
        ? { email, code: grant }
        : { email, code: "COMMITTEE_LEADER", committeeId: grant.leaderOf },
    );
  }
  return personId;
}

async function putOnLeave(personId: string): Promise<void> {
  await db()
    .update(membership)
    .set({ status: "ON_LEAVE" })
    .where(eq(membership.personId, personId));
}

/** El comando rechazó por la regla de privilegio y no dejó enlace, auditoría ni evento. */
async function expectNoPrivilegeGain(issuerId: string, recipientId: string): Promise<void> {
  const intento = issueAccessGrantAs(
    { personId: issuerId },
    { personId: recipientId, kind: "RECOVERY" },
  );
  await expect(intento).rejects.toBeInstanceOf(DomainError);
  await expect(intento).rejects.toThrow(t("T-3206"));
  expect(await db().select().from(accessGrant)).toHaveLength(0);
  expect(
    await db().select().from(auditLog).where(eq(auditLog.action, "access-grant.issued")),
  ).toHaveLength(0);
  expect(
    await db().select().from(outbox).where(eq(outbox.eventType, "access-grant.issued")),
  ).toHaveLength(0);
}

describe("enlace de acceso", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("emite, audita y consume el enlace anterior de esa persona", async () => {
    const emisor = await seedMember("junta@eafit.edu.co");
    const destino = await seedMember("destino@eafit.edu.co");

    const primero = await issueAccessGrantAs(
      { personId: emisor },
      { personId: destino, kind: "ACTIVATION" },
    );
    const segundo = await issueAccessGrantAs(
      { personId: emisor },
      { personId: destino, kind: "RECOVERY" },
    );

    expect(await resolveAccessGrant(primero.token)).toBeNull();
    expect(await resolveAccessGrant(segundo.token)).toMatchObject({
      personId: destino,
      kind: "RECOVERY",
      name: "Camila",
    });
    const auditorias = await db()
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.action, "access-grant.issued"));
    expect(auditorias).toHaveLength(2);
  });

  it("nunca guarda el token en claro", async () => {
    const emisor = await seedMember("junta@eafit.edu.co");
    const destino = await seedMember("destino@eafit.edu.co");

    const { token } = await issueAccessGrantAs(
      { personId: emisor },
      { personId: destino, kind: "ACTIVATION" },
    );

    const filas = await db().select().from(accessGrant);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(filas)).not.toContain(token);
  });

  it("no deja emitir para uno mismo ni para quien no puede entrar", async () => {
    const emisor = await seedMember("junta@eafit.edu.co");
    const retirada = await seedMember("retirada@eafit.edu.co", "INACTIVE");

    await expect(
      issueAccessGrantAs({ personId: emisor }, { personId: emisor, kind: "RECOVERY" }),
    ).rejects.toThrow();
    await expect(
      issueAccessGrantAs({ personId: emisor }, { personId: retirada, kind: "ACTIVATION" }),
    ).rejects.toThrow();
    expect(await db().select().from(accessGrant)).toHaveLength(0);
  });

  it("fija la contraseña, cierra las sesiones viejas y deja una sesión que sí resuelve", async () => {
    const emisor = await seedMember("junta@eafit.edu.co");
    const destino = await seedMember("destino@eafit.edu.co");
    // Una sesión anterior, como la de un celular perdido.
    const vieja = await createSession(db(), {
      personId: destino,
      remember: true,
      userAgent: "viejo",
      ip: null,
    });
    const { token } = await issueAccessGrantAs(
      { personId: emisor },
      { personId: destino, kind: "RECOVERY" },
    );

    const result = await consumeAccessGrant({
      token,
      password: CLAVE,
      ip: "10.0.0.9",
      userAgent: "vitest",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // La regresión que motivó la corrección de la regla 5: la sesión nueva tiene que resolver.
    expect((await resolveActor(result.token))?.personId).toBe(destino);
    expect(await resolveActor(vieja.token)).toBeNull();
    const sesiones = await db().select().from(session).where(eq(session.personId, destino));
    expect(sesiones).toHaveLength(1);
    const guardado = await findPasswordHash(destino);
    expect(guardado).not.toBeNull();
    expect(await verifyPassword(guardado ?? "", CLAVE)).toBe(true);
    const [fila] = await db().select().from(accessGrant);
    expect(fila?.consumedAt).toBeInstanceOf(Date);
    expect(fila?.consumedIp).toBe("10.0.0.9");
  });

  it("la contraseña nueva sirve para entrar por el ingreso normal", async () => {
    const emisor = await seedMember("junta@eafit.edu.co");
    await seedMember("destino@eafit.edu.co");
    const [destino] = await db()
      .select({ id: person.id })
      .from(person)
      .where(eq(person.email, "destino@eafit.edu.co"));
    const { token } = await issueAccessGrantAs(
      { personId: emisor },
      { personId: destino?.id ?? "", kind: "ACTIVATION" },
    );
    await consumeAccessGrant({ token, password: CLAVE, ip: null, userAgent: null });

    const entrada = await signInWithPassword({
      email: "destino@eafit.edu.co",
      password: CLAVE,
      ip: null,
      userAgent: null,
      remember: false,
    });

    expect(entrada.ok).toBe(true);
  });

  it("sirve una sola vez", async () => {
    const emisor = await seedMember("junta@eafit.edu.co");
    const destino = await seedMember("destino@eafit.edu.co");
    const { token } = await issueAccessGrantAs(
      { personId: emisor },
      { personId: destino, kind: "ACTIVATION" },
    );
    await consumeAccessGrant({ token, password: CLAVE, ip: null, userAgent: null });

    const otraVez = await consumeAccessGrant({
      token,
      password: "otra clave larga distinta",
      ip: null,
      userAgent: null,
    });

    expect(otraVez).toEqual({ ok: false, reason: "INVALID" });
    // La segunda no pisó la primera contraseña.
    expect(await verifyPassword((await findPasswordHash(destino)) ?? "", CLAVE)).toBe(true);
  });

  it("una contraseña que no pasa las reglas deja el enlace vivo", async () => {
    const emisor = await seedMember("junta@eafit.edu.co");
    const destino = await seedMember("destino@eafit.edu.co");
    const { token } = await issueAccessGrantAs(
      { personId: emisor },
      { personId: destino, kind: "ACTIVATION" },
    );

    expect(
      await consumeAccessGrant({ token, password: "corta", ip: null, userAgent: null }),
    ).toEqual({
      ok: false,
      reason: "PASSWORD",
      problem: "SHORT",
    });
    expect(
      await consumeAccessGrant({ token, password: "camila y su clave", ip: null, userAgent: null }),
    ).toEqual({ ok: false, reason: "PASSWORD", problem: "PERSONAL" });

    expect(await resolveAccessGrant(token)).not.toBeNull();
    expect(await findPasswordHash(destino)).toBeNull();
  });

  it("un enlace vencido, desconocido o de persona retirada no resuelve", async () => {
    const emisor = await seedMember("junta@eafit.edu.co");
    const destino = await seedMember("destino@eafit.edu.co");
    const { token } = await issueAccessGrantAs(
      { personId: emisor },
      { personId: destino, kind: "ACTIVATION" },
    );

    const enDosHoras = new Date(Date.now() + 2 * 60 * 60_000);
    expect(await resolveAccessGrant(token, enDosHoras)).toBeNull();
    expect(await resolveAccessGrant("un-token-inventado")).toBeNull();

    await db()
      .update(membership)
      .set({ status: "INACTIVE" })
      .where(eq(membership.personId, destino));
    expect(await resolveAccessGrant(token)).toBeNull();
  });

  it("reemplaza la contraseña anterior cuando es una recuperación", async () => {
    const emisor = await seedMember("junta@eafit.edu.co");
    const destino = await seedMember("destino@eafit.edu.co");
    await db()
      .insert(credential)
      .values({ personId: destino, passwordHash: await hashPassword("la vieja larga") });
    const { token } = await issueAccessGrantAs(
      { personId: emisor },
      { personId: destino, kind: "RECOVERY" },
    );

    await consumeAccessGrant({ token, password: CLAVE, ip: null, userAgent: null });

    const guardado = (await findPasswordHash(destino)) ?? "";
    expect(await verifyPassword(guardado, CLAVE)).toBe(true);
    expect(await verifyPassword(guardado, "la vieja larga")).toBe(false);
    expect(await db().select().from(credential)).toHaveLength(1);
  });

  // Quien emite ve el enlace y puede entrar como su destinatario (amenaza aceptada de ADR-051): por
  // eso el enlace no le puede dar permisos que no tiene (ADR-113 regla 1).
  describe("emitirlo no deja subir de privilegio", () => {
    it("la junta sin ADMIN no emite un enlace para una persona con ADMIN", async () => {
      const junta = await seedMemberWith("junta@eafit.edu.co", "BOARD");
      const admin = await seedMemberWith("admin@eafit.edu.co", "ADMIN");

      await expectNoPrivilegeGain(junta, admin);
    });

    it("la junta no emite para quien lidera un comité que ella no lidera", async () => {
      const gemis = await seedCommittee("gemis");
      const nexos = await seedCommittee("nexos");
      const junta = await seedMemberWith("junta@eafit.edu.co", "BOARD", { leaderOf: gemis });
      const lider = await seedMemberWith("lider@eafit.edu.co", { leaderOf: nexos });

      await expectNoPrivilegeGain(junta, lider);
    });

    it("quien no tiene permisos no emite para una persona de la junta", async () => {
      const miembro = await seedMember("miembro@eafit.edu.co");
      const junta = await seedMemberWith("junta@eafit.edu.co", "BOARD");

      await expectNoPrivilegeGain(miembro, junta);
    });

    it("la junta sigue emitiendo para un miembro sin permisos y para quien tiene los mismos que ella", async () => {
      const gemis = await seedCommittee("gemis");
      const junta = await seedMemberWith("junta@eafit.edu.co", "BOARD", { leaderOf: gemis });
      const miembro = await seedMember("miembro@eafit.edu.co");
      const colega = await seedMemberWith("colega@eafit.edu.co", "BOARD");
      const lider = await seedMemberWith("lider@eafit.edu.co", { leaderOf: gemis });

      for (const destino of [miembro, colega, lider]) {
        const { token } = await issueAccessGrantAs(
          { personId: junta },
          { personId: destino, kind: "RECOVERY" },
        );
        expect(await resolveAccessGrant(token)).toMatchObject({ personId: destino });
      }
    });

    it("ADMIN emite para cualquiera, también para otro ADMIN, y nunca para sí mismo", async () => {
      const gemis = await seedCommittee("gemis");
      const admin = await seedMemberWith("admin@eafit.edu.co", "ADMIN");
      const otro = await seedMemberWith("otro@eafit.edu.co", "ADMIN", "BOARD", { leaderOf: gemis });

      const { token } = await issueAccessGrantAs(
        { personId: admin },
        { personId: otro, kind: "RECOVERY" },
      );

      expect(await resolveAccessGrant(token)).toMatchObject({ personId: otro });
      await expect(
        issueAccessGrantAs({ personId: admin }, { personId: admin, kind: "RECOVERY" }),
      ).rejects.toThrow(t("T-2126"));
    });

    it("los permisos de quien emite no cuentan mientras está en licencia", async () => {
      const enLicencia = await seedMemberWith("licencia@eafit.edu.co", "ADMIN");
      const admin = await seedMemberWith("admin@eafit.edu.co", "ADMIN");
      await putOnLeave(enLicencia);

      await expectNoPrivilegeGain(enLicencia, admin);
    });

    it("los permisos del destinatario cuentan aunque esté en licencia", async () => {
      const junta = await seedMemberWith("junta@eafit.edu.co", "BOARD");
      const adminEnLicencia = await seedMemberWith("admin@eafit.edu.co", "ADMIN");
      await putOnLeave(adminEnLicencia);

      await expectNoPrivilegeGain(junta, adminEnLicencia);
    });
  });
});
