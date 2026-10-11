import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { grantPermission, grantPermissionAs, revokePermission } from "@/modules/identity";
import {
  consumeAccessGrant,
  issueAccessGrant,
  issueAccessGrantAs,
  resolveAccessGrant,
} from "@/modules/identity/domain/access-grant";
import { findPasswordHash, signInWithPassword } from "@/modules/identity/domain/password";
import { hashPassword, hashToken, verifyPassword } from "@/modules/identity/domain/pure";
import { createSession, resolveActor } from "@/modules/identity/domain/session";
import { accessGrant, credential, permission, session } from "@/modules/identity/schema";
import { changeMembershipStatus, endMembershipAs } from "@/modules/people";
import { endMembership } from "@/modules/people/domain/membership";
import { committee, membership, person } from "@/modules/people/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { backendPid, deferred, holdCommand, waitingOn, whileHeld } from "../helpers/locks";
import { drainOutbox } from "../helpers/outbox";
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
    { personId: issuerId, ip: null },
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
      { personId: emisor, ip: null },
      { personId: destino, kind: "ACTIVATION" },
    );
    const segundo = await issueAccessGrantAs(
      { personId: emisor, ip: null },
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
      { personId: emisor, ip: null },
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
      issueAccessGrantAs({ personId: emisor, ip: null }, { personId: emisor, kind: "RECOVERY" }),
    ).rejects.toThrow();
    await expect(
      issueAccessGrantAs(
        { personId: emisor, ip: null },
        { personId: retirada, kind: "ACTIVATION" },
      ),
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
      { personId: emisor, ip: null },
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
      { personId: emisor, ip: null },
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
      { personId: emisor, ip: null },
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
      { personId: emisor, ip: null },
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
      { personId: emisor, ip: null },
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
      { personId: emisor, ip: null },
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

    // Basta un permiso de más: que quien emite cubra alguno de los del destinatario no alcanza, los
    // tiene que cubrir todos. Una persona de la junta que además es ADMIN es el caso de DT-055.
    it("la junta no emite para quien además de ser de la junta es ADMIN", async () => {
      const junta = await seedMemberWith("junta@eafit.edu.co", "BOARD");
      const juntaYAdmin = await seedMemberWith("admin@eafit.edu.co", "BOARD", "ADMIN");

      await expectNoPrivilegeGain(junta, juntaYAdmin);
    });

    it("la junta que lidera un comité no emite para quien lidera ese y otro más", async () => {
      const gemis = await seedCommittee("gemis");
      const nexos = await seedCommittee("nexos");
      const junta = await seedMemberWith("junta@eafit.edu.co", "BOARD", { leaderOf: gemis });
      const lider = await seedMemberWith(
        "lider@eafit.edu.co",
        { leaderOf: nexos },
        { leaderOf: gemis },
      );

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
          { personId: junta, ip: null },
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
        { personId: admin, ip: null },
        { personId: otro, kind: "RECOVERY" },
      );

      expect(await resolveAccessGrant(token)).toMatchObject({ personId: otro });
      await expect(
        issueAccessGrantAs({ personId: admin, ip: null }, { personId: admin, kind: "RECOVERY" }),
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

    // DT-292, ADR-120 regla 5: el estado de quien emite se lee con el candado de su ciclo de
    // membresía tomado. Leído por otra conexión, la licencia que todavía no confirma no se ve y el
    // enlace nace con los permisos de alguien que ya no los opera.
    describe("mientras cambia el estado de quien emite", () => {
      const HOY = new Date("2026-08-03T15:00:00Z");

      /** Deja a la persona saliendo a licencia, escrito y sin confirmar. */
      function leavingOnHold(personId: string) {
        return holdCommand(SYSTEM_ACTOR, (ctx) =>
          changeMembershipStatus(
            ctx,
            personId,
            { to: "ON_LEAVE", reason: "Intercambio", leaveUntil: "2026-09-01" },
            HOY,
          ),
        );
      }

      it("la emisión que llega mientras quien emite sale a licencia espera, y se rechaza con la licencia ya puesta", async () => {
        const junta = await seedMemberWith("junta@eafit.edu.co", "BOARD");
        const colega = await seedMemberWith("colega@eafit.edu.co", "BOARD");

        const held = await leavingOnHold(junta);
        const emision = issueAccessGrantAs(
          { personId: junta, ip: null },
          { personId: colega, kind: "RECOVERY" },
        );
        const sinEsperar = emision.then(
          () => "emitió sin esperar",
          () => "rechazó sin esperar",
        );
        const enCola = vi
          .waitFor(async () => expect(await waitingOn(held.pid)).toBe(1), { timeout: 5_000 })
          .then(
            () => "espera",
            () => "nunca hizo cola",
          );
        try {
          expect(await Promise.race([sinEsperar, enCola])).toBe("espera");
        } finally {
          held.release();
          await held.done;
        }

        await expect(emision).rejects.toBeInstanceOf(DomainError);
        await expect(emision).rejects.toThrow(t("T-3206"));
        expect(await db().select().from(accessGrant)).toHaveLength(0);
      });

      it("si la licencia no llega a confirmar, la emisión que esperaba sale con el estado que quedó", async () => {
        const junta = await seedMemberWith("junta@eafit.edu.co", "BOARD");
        const colega = await seedMemberWith("colega@eafit.edu.co", "BOARD");

        const ready = deferred<number>();
        const release = deferred<void>();
        const licencia = runCommand(SYSTEM_ACTOR, async (ctx) => {
          await changeMembershipStatus(
            ctx,
            junta,
            { to: "ON_LEAVE", reason: "Intercambio", leaveUntil: "2026-09-01" },
            HOY,
          );
          ready.resolve(await backendPid(ctx.tx));
          await release.promise;
          throw new Error("la licencia no confirma");
        });
        void licencia.catch(ready.reject);
        const pid = await ready.promise;
        const emision = issueAccessGrantAs(
          { personId: junta, ip: null },
          { personId: colega, kind: "RECOVERY" },
        );
        void emision.catch(() => undefined);
        try {
          await vi.waitFor(async () => expect(await waitingOn(pid)).toBe(1), { timeout: 5_000 });
        } finally {
          release.resolve();
          await licencia.catch(() => undefined);
        }

        await emision;
        expect(await db().select().from(accessGrant)).toHaveLength(1);
      });

      it("para un destinatario sin permisos la emisión no espera el ciclo de quien emite", async () => {
        const junta = await seedMemberWith("junta@eafit.edu.co", "BOARD");
        const miembro = await seedMember("miembro@eafit.edu.co");

        const held = await leavingOnHold(junta);
        try {
          await issueAccessGrantAs(
            { personId: junta, ip: null },
            { personId: miembro, kind: "RECOVERY" },
          );
        } finally {
          held.release();
          await held.done;
        }

        expect(await db().select().from(accessGrant)).toHaveLength(1);
      });
    });
  });

  // ADR-119 regla 17: la regla de privilegio mira los permisos al emitir, así que el enlace emitido
  // antes de una concesión no puede seguir vivo después de ella.
  describe("conceder un permiso deja sin enlace a quien lo recibe", () => {
    const DESTINO = "destino@eafit.edu.co";

    async function linksOf(personId: string): Promise<number> {
      const rows = await db().select().from(accessGrant).where(eq(accessGrant.personId, personId));
      return rows.length;
    }

    it("el enlace que la junta emitió antes de la concesión ya no abre ni fija contraseña", async () => {
      const junta = await seedMemberWith("junta@eafit.edu.co", "BOARD");
      const destino = await seedMember(DESTINO);
      const { token } = await issueAccessGrantAs(
        { personId: junta, ip: null },
        { personId: destino, kind: "RECOVERY" },
      );
      expect(await resolveAccessGrant(token)).toMatchObject({ personId: destino });

      await grantPermissionAs(SYSTEM_ACTOR, { email: DESTINO, code: "ADMIN" });

      expect(await resolveAccessGrant(token)).toBeNull();
      expect(
        await consumeAccessGrant({ token, password: CLAVE, ip: null, userAgent: null }),
      ).toEqual({ ok: false, reason: "INVALID" });
      expect(await findPasswordHash(destino)).toBeNull();
      expect(await linksOf(destino)).toBe(0);
    });

    it("el enlace de otra persona sigue vivo", async () => {
      const junta = await seedMemberWith("junta@eafit.edu.co", "BOARD");
      const destino = await seedMember(DESTINO);
      const otra = await seedMember("otra@eafit.edu.co");
      const ajeno = await issueAccessGrantAs(
        { personId: junta, ip: null },
        { personId: otra, kind: "ACTIVATION" },
      );

      await grantPermissionAs(SYSTEM_ACTOR, { email: DESTINO, code: "BOARD" });

      expect(await resolveAccessGrant(ajeno.token)).toMatchObject({ personId: otra });
      expect(await linksOf(destino)).toBe(0);
    });

    it("una concesión que no entra, porque ya tenía ese permiso, deja el enlace como estaba", async () => {
      const admin = await seedMemberWith("admin@eafit.edu.co", "ADMIN");
      const destino = await seedMemberWith(DESTINO, "BOARD");
      const { token } = await issueAccessGrantAs(
        { personId: admin, ip: null },
        { personId: destino, kind: "RECOVERY" },
      );

      await expect(
        grantPermissionAs(SYSTEM_ACTOR, { email: DESTINO, code: "BOARD" }),
      ).rejects.toThrow(t("T-268"));

      expect(await resolveAccessGrant(token)).toMatchObject({ personId: destino });
    });

    // Las dos solicitudes a la vez: sin un candado común la emisión leería los permisos de antes de
    // una concesión que todavía no confirma, y el enlace nacería después de que ella borró.
    it("la emisión que llega mientras se concede espera, y se rechaza con el permiso ya puesto", async () => {
      const junta = await seedMemberWith("junta@eafit.edu.co", "BOARD");
      const destino = await seedMember(DESTINO);

      const held = await holdCommand(SYSTEM_ACTOR, (ctx) =>
        grantPermission(ctx, { email: DESTINO, code: "ADMIN" }),
      );
      const emision = issueAccessGrantAs(
        { personId: junta, ip: null },
        { personId: destino, kind: "RECOVERY" },
      );
      void emision.catch(() => undefined);
      try {
        await vi.waitFor(async () => expect(await waitingOn(held.pid)).toBe(1), {
          timeout: 5_000,
        });
      } finally {
        held.release();
        await held.done;
      }

      await expect(emision).rejects.toThrow(t("T-3206"));
      expect(await linksOf(destino)).toBe(0);
    });

    it("la concesión que llega mientras se emite espera, y borra el enlace recién emitido", async () => {
      const junta = await seedMemberWith("junta@eafit.edu.co", "BOARD");
      const destino = await seedMember(DESTINO);

      let token = "";
      const held = await holdCommand({ personId: junta, ip: null }, async (ctx) => {
        token = (await issueAccessGrant(ctx, { personId: destino, kind: "RECOVERY" })).token;
      });
      const concesion = grantPermissionAs(SYSTEM_ACTOR, { email: DESTINO, code: "ADMIN" });
      void concesion.catch(() => undefined);
      try {
        await vi.waitFor(async () => expect(await waitingOn(held.pid)).toBe(1), {
          timeout: 5_000,
        });
      } finally {
        held.release();
        await held.done;
      }
      await concesion;

      expect(token).not.toBe("");
      expect(await resolveAccessGrant(token)).toBeNull();
      expect(await linksOf(destino)).toBe(0);
    });
  });

  // DT-302: la emisión leía por otra conexión si el destinatario puede entrar, y los permisos de quien
  // emite antes de esperar su candado; revocar un permiso no tomaba ninguno. Cada cruce se fuerza en
  // los dos órdenes de llegada, con uno de los dos comandos escrito y sin confirmar (ADR-122 regla 5).
  describe("mientras dan de baja al destinatario o le revocan un permiso a quien emite", () => {
    const DESTINO = "destino.carrera@eafit.edu.co";
    const BAJA = {
      endReason: "RESIGNATION",
      memorialConsent: false,
      contactConsent: false,
    } as const;
    const system = SYSTEM_ACTOR;

    async function linksOf(personId: string): Promise<number> {
      const rows = await db().select().from(accessGrant).where(eq(accessGrant.personId, personId));
      return rows.length;
    }

    async function statusOf(personId: string) {
      const [row] = await db()
        .select({ status: membership.status })
        .from(membership)
        .where(eq(membership.personId, personId));
      return row?.status;
    }

    async function boardPermissionOf(personId: string): Promise<string> {
      const [row] = await db()
        .select({ id: permission.id })
        .from(permission)
        .where(eq(permission.personId, personId));
      if (!row) throw new Error("permiso");
      return row.id;
    }

    /** La emisión de la junta para esa persona: «emitió» o el error con que se rechazó. */
    function issuing(issuerId: string, recipientId: string) {
      const answer: { value: unknown } = { value: null };
      const run = async () => {
        answer.value = await issueAccessGrantAs(
          { personId: issuerId, ip: null },
          { personId: recipientId, kind: "RECOVERY" },
        ).then(
          () => "emitió",
          (error: unknown) => error,
        );
      };
      return { answer, run };
    }

    it("la emisión que llega mientras dan de baja al destinatario espera, y se rechaza con la baja ya puesta", async () => {
      const junta = await seedMemberWith("junta@eafit.edu.co", "BOARD");
      const destino = await seedMember(DESTINO);
      const held = await holdCommand(system, (ctx) => endMembership(ctx, destino, BAJA));
      const emision = issuing(junta, destino);

      const how = await whileHeld(held, emision.run);

      expect(emision.answer.value).toEqual(new DomainError(t("T-2127")));
      expect(await linksOf(destino)).toBe(0);
      expect(how).toBe("hizo cola");
    });

    it("la baja que llega mientras se emite espera, y lo que depura borra el enlace recién emitido", async () => {
      const junta = await seedMemberWith("junta@eafit.edu.co", "BOARD");
      const destino = await seedMember(DESTINO);
      const held = await holdCommand({ personId: junta, ip: null }, (ctx) =>
        issueAccessGrant(ctx, { personId: destino, kind: "RECOVERY" }),
      );

      const how = await whileHeld(held, async () => {
        await endMembershipAs(system, destino, BAJA);
        await drainOutbox();
      });

      expect(await statusOf(destino)).toBe("INACTIVE");
      expect(await linksOf(destino)).toBe(0);
      expect(how).toBe("hizo cola");
    });

    it("la emisión que llega mientras le revocan el permiso a quien emite espera, y se rechaza sin ese permiso", async () => {
      const junta = await seedMemberWith("junta@eafit.edu.co", "BOARD");
      const colega = await seedMemberWith("colega@eafit.edu.co", "BOARD");
      const permissionId = await boardPermissionOf(junta);
      const held = await holdCommand(system, (ctx) => revokePermission(ctx, permissionId));
      const emision = issuing(junta, colega);

      const how = await whileHeld(held, emision.run);

      expect(emision.answer.value).toEqual(new DomainError(t("T-3206")));
      expect(await linksOf(colega)).toBe(0);
      expect(how).toBe("hizo cola");
    });

    it("la revocación que llega mientras quien pierde el permiso emite espera, y el enlace que ya había emitido sigue (decisión abierta 68)", async () => {
      const junta = await seedMemberWith("junta@eafit.edu.co", "BOARD");
      const colega = await seedMemberWith("colega@eafit.edu.co", "BOARD");
      const permissionId = await boardPermissionOf(junta);
      const held = await holdCommand({ personId: junta, ip: null }, (ctx) =>
        issueAccessGrant(ctx, { personId: colega, kind: "RECOVERY" }),
      );

      const how = await whileHeld(held, () =>
        runCommand(system, (ctx) => revokePermission(ctx, permissionId)),
      );

      expect(how).toBe("hizo cola");
      expect(await db().select().from(permission).where(eq(permission.personId, junta))).toEqual(
        [],
      );
      // Es lo que queda si la revocación llega un instante después de emitir: no borra lo emitido.
      // Si debe borrarlo es la decisión abierta 68 (DT-329); acá se conserva la conducta de hoy.
      expect(await linksOf(colega)).toBe(1);
    });

    it("dos de la junta que se emiten enlace el uno al otro a la vez terminan los dos, sin cruzarse", async () => {
      const junta = await seedMemberWith("junta@eafit.edu.co", "BOARD");
      const colega = await seedMemberWith("colega@eafit.edu.co", "BOARD");
      for (let round = 0; round < 10; round += 1) {
        const [a, b] = await Promise.allSettled([
          issueAccessGrantAs({ personId: junta, ip: null }, { personId: colega, kind: "RECOVERY" }),
          issueAccessGrantAs({ personId: colega, ip: null }, { personId: junta, kind: "RECOVERY" }),
        ]);
        expect([a.status, b.status]).toEqual(["fulfilled", "fulfilled"]);
      }
    });
  });
});
