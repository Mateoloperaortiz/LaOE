import { randomBytes } from "node:crypto";
import { open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { count, eq, inArray, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { getEnv } from "@/env";
import { page } from "@/modules/content/schema";
import { event, eventEdition } from "@/modules/events/schema";
import { hashPassword } from "@/modules/identity/domain/pure";
import { credential, permission } from "@/modules/identity/schema";
import {
  checkoutAs,
  createItemAs,
  listReservations,
  readCatalog,
  reserveAs,
  returnAs,
  setReservationGrantAs,
} from "@/modules/inventory";
import { inventoryReservation } from "@/modules/inventory/schema";
import { listLogisticsSources, setLogisticsDirectorAs } from "@/modules/people";
import {
  appointment,
  committee,
  committeeMembership,
  committeeRoleAssignment,
  consent,
  membership,
  person,
} from "@/modules/people/schema";
import { workGroup, workGroupMembership } from "@/modules/permanence/schema";
import { appConfig } from "@/modules/system/schema";
import { pointSeparationPolicy, term } from "@/modules/terms/schema";
import { todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { inventoryReviewTarget } from "./lib/inventory-review-guard";

// Uso: node --conditions=react-server --import tsx scripts/seed-inventory-review.ts --access-file /ruta/privada/accesos.json
// Exige migraciones ya aplicadas y una base vacía inventory_review_*. No borra ni reinicia datos.
// Las contraseñas aleatorias salen únicamente al archivo privado obligatorio; stdout solo cuenta filas.

const ACCOUNTS = [
  {
    role: "VP administrativa",
    key: "vp",
    firstName: "VP",
    lastName: "Ficticia",
    uid: "00 00 00 01",
  },
  {
    role: "Dirección logística del comité",
    key: "director",
    firstName: "Dirección",
    lastName: "Ficticia",
    uid: "00 00 00 02",
  },
  {
    role: "CML y persona delegada",
    key: "cml",
    firstName: "Operación",
    lastName: "Ficticia",
    uid: "00 00 00 03",
  },
  {
    role: "Miembro con carnet pendiente",
    key: "miembro",
    firstName: "Integrante",
    lastName: "Ficticio",
    uid: null,
  },
  {
    role: "ADMIN de soporte",
    key: "soporte",
    firstName: "Soporte",
    lastName: "Ficticio",
    uid: "00 00 00 05",
  },
  {
    role: "Dirección logística del macroevento",
    key: "macroevento",
    firstName: "Macroevento",
    lastName: "Ficticio",
    uid: "00 00 00 06",
  },
] as const;

async function accessDestination(args: string[]): Promise<string> {
  if (args.length !== 2 || args[0] !== "--access-file" || !args[1] || !isAbsolute(args[1]))
    throw new Error("Indica --access-file con una ruta absoluta privada fuera del repo.");
  const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
  const parent = await realpath(dirname(args[1]));
  const location = relative(root, parent);
  if (
    location === "" ||
    (!location.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
      !isAbsolute(location) &&
      location !== "..")
  )
    throw new Error("El archivo de accesos debe quedar fuera del repo.");
  return resolve(parent, args[1].split(/[\\/]/).at(-1) ?? "");
}

function semesterAt(day: string) {
  const year = Number(day.slice(0, 4));
  const semester = Number(day.slice(5, 7)) <= 6 ? 1 : 2;
  return {
    code: `${year}-${semester}`,
    semester,
    startsOn: `${year}-${semester === 1 ? "01-01" : "07-01"}`,
    endsOn: `${year}-${semester === 1 ? "06-30" : "12-31"}`,
  };
}

let seedStage = "target";

async function main() {
  const target = inventoryReviewTarget(process.env.DATABASE_URL ?? "", process.env.APP_URL ?? "");
  seedStage = "access-file";
  const accessFile = await accessDestination(process.argv.slice(2));
  const env = getEnv();
  // getEnv valida el entorno completo; se comprueba otra vez su destino ya normalizado.
  inventoryReviewTarget(env.DATABASE_URL, env.APP_URL);
  seedStage = "connection";
  const db = getDb();
  const actual = await db.execute<{ database: string }>(sql`select current_database() as database`);
  if (actual.rows[0]?.database !== target.databaseName)
    throw new Error("La conexión no corresponde a la base de revisión solicitada.");
  const [existing] = await db.select({ n: count() }).from(person);
  if (existing?.n)
    throw new Error("La base ya contiene personas; el seed no la modifica ni se repite.");

  seedStage = "credentials";
  const accounts: Array<
    (typeof ACCOUNTS)[number] & { email: string; password: string; passwordHash: string }
  > = [];
  for (const entry of ACCOUNTS) {
    const password = randomBytes(24).toString("base64url");
    accounts.push({
      ...entry,
      email: `${entry.key}@inventario.example`,
      password,
      passwordHash: await hashPassword(password),
    });
  }
  const access = await open(accessFile, "wx", 0o600);
  await access.chmod(0o600);
  const privateData = {
    appUrl: target.appOrigin,
    synthetic: true,
    status: "incomplete",
    accounts: accounts.map(({ passwordHash: _hash, ...entry }) => entry),
  };
  await access.writeFile(`${JSON.stringify(privateData, null, 2)}\n`);
  await access.sync();
  try {
    const now = new Date();
    const current = semesterAt(todayKey(now));
    const previous = semesterAt(
      `${Number(current.code.slice(0, 4)) - (current.semester === 1 ? 1 : 0)}-${current.semester === 1 ? "07-01" : "01-01"}`,
    );
    const editionStart = new Date(now.getTime() + 2 * 86400000);
    const editionSemester = semesterAt(todayKey(editionStart));
    const policyVersion = "revision-sintetica-inventario-v1";
    seedStage = "base-transaction";
    const ids = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('inventory-review-seed', 0))`,
      );
      const [occupied] = await tx.select({ n: count() }).from(person);
      if (occupied?.n) throw new Error("La base ya contiene personas de revisión.");
      const [policy] = await tx.select().from(pointSeparationPolicy);
      if (!policy) throw new Error("Aplica las migraciones antes del seed.");
      seedStage = "terms";
      const terms = new Map<string, string>();
      for (const item of [previous, current, editionSemester]) {
        if (terms.has(item.code)) continue;
        await tx
          .insert(term)
          .values({ ...item, gamePointsSeparated: item.code >= policy.firstTermCode })
          .onConflictDoNothing({ target: term.code });
        const [stored] = await tx
          .select({ id: term.id })
          .from(term)
          .where(eq(term.code, item.code));
        if (!stored) throw new Error("No se pudo preparar el semestre sintético.");
        terms.set(item.code, stored.id);
      }
      const currentId = terms.get(current.code);
      const previousId = terms.get(previous.code);
      if (!currentId || !previousId) throw new Error("Faltan semestres de revisión.");
      seedStage = "privacy";
      await tx
        .insert(appConfig)
        .values({ key: "privacy.policyVersion", value: policyVersion })
        .onConflictDoUpdate({ target: appConfig.key, set: { value: policyVersion } });
      await tx
        .insert(page)
        .values({
          slug: "privacidad",
          title: "Privacidad de la revisión sintética",
          body: "Entorno temporal de revisión con cuentas y materiales ficticios. No ingreses datos personales reales.",
          status: "PUBLISHED",
        })
        .onConflictDoUpdate({
          target: page.slug,
          set: {
            title: "Privacidad de la revisión sintética",
            body: "Entorno temporal de revisión con cuentas y materiales ficticios. No ingreses datos personales reales.",
            status: "PUBLISHED",
          },
        });
      const [group] = await tx
        .insert(committee)
        .values({
          slug: "comite-demostracion",
          name: "Comité ficticio",
          status: "ACTIVE",
          publicationStatus: "PUBLISHED",
        })
        .returning({ id: committee.id });
      if (!group) throw new Error("No se pudo crear el comité ficticio.");
      seedStage = "people";
      const people = new Map<string, string>();
      for (const entry of accounts) {
        const [who] = await tx
          .insert(person)
          .values({
            firstName: entry.firstName,
            lastName: entry.lastName,
            email: entry.email,
            kind: "STUDENT",
            stage: "MEMBER",
            cardUid: entry.uid,
            source: "INVENTORY_REVIEW",
          })
          .returning({ id: person.id });
        if (!who) throw new Error("No se pudo crear una cuenta ficticia.");
        people.set(entry.key, who.id);
        await tx
          .insert(membership)
          .values({ personId: who.id, status: "ACTIVE", firstTermId: previousId });
        await tx.insert(credential).values({ personId: who.id, passwordHash: entry.passwordHash });
        await tx
          .insert(consent)
          .values({ personId: who.id, purpose: "MEMBERSHIP", source: "ADMIN", policyVersion });
        const [entryMembership] = await tx
          .insert(committeeMembership)
          .values({
            personId: who.id,
            committeeId: group.id,
            termId: currentId,
            roleCode: entry.key === "soporte" ? "GENERAL" : "MIEMBRO",
            joinedAt: now,
          })
          .returning({ id: committeeMembership.id });
        if (!entryMembership) throw new Error("No se pudo preparar la pertenencia ficticia.");
        if (entry.key === "soporte") {
          await tx.insert(committeeRoleAssignment).values({
            membershipId: entryMembership.id,
            personId: who.id,
            committeeId: group.id,
            termId: currentId,
            roleCode: "GENERAL",
          });
          await tx.insert(permission).values({ personId: who.id, code: "ADMIN" });
        }
      }
      const vp = people.get("vp");
      const cml = people.get("cml");
      const director = people.get("director");
      const macro = people.get("macroevento");
      if (!vp || !cml || !director || !macro) throw new Error("Faltan cuentas ficticias.");
      await tx.insert(appointment).values({ personId: vp, termId: currentId, kind: "VP_ADMIN" });
      const [warehouse] = await tx
        .insert(workGroup)
        .values({
          termId: currentId,
          kind: "WORK_COMMITTEE",
          code: "CML",
          name: "CML ficticio",
          leaderPersonId: vp,
          createdById: vp,
        })
        .returning({ id: workGroup.id });
      if (!warehouse) throw new Error("No se pudo preparar el CML ficticio.");
      await tx.insert(workGroupMembership).values({ groupId: warehouse.id, personId: cml });
      seedStage = "macroevent";
      // Las migraciones traen el catálogo de macroeventos: se reutiliza sin cambiar su ficha.
      await tx
        .insert(event)
        .values({ slug: "inventiva", name: "Macroevento ficticio" })
        .onConflictDoNothing({ target: event.slug });
      const [macroevent] = await tx
        .select({ id: event.id })
        .from(event)
        .where(eq(event.slug, "inventiva"));
      if (!macroevent) throw new Error("No se pudo preparar el macroevento ficticio.");
      const [edition] = await tx
        .insert(eventEdition)
        .values({
          eventId: macroevent.id,
          slug: "edicion-revision",
          name: "Edición ficticia",
          startsAt: editionStart,
          endsAt: new Date(editionStart.getTime() + 4 * 3600000),
          publicationStatus: "PUBLISHED",
        })
        .returning({ id: eventEdition.id });
      if (!edition) throw new Error("No se pudo preparar la edición ficticia.");
      return {
        vp,
        cml,
        director,
        macro,
        committeeId: group.id,
        termId: currentId,
        editionId: edition.id,
      };
    });

    seedStage = "logistics-and-grants";
    const manager = { personId: ids.vp, isAdmin: false, ip: null };
    await setLogisticsDirectorAs(
      manager,
      { kind: "COMMITTEE", committeeId: ids.committeeId, termId: ids.termId },
      { personId: ids.director, assigned: true, coDirector: false },
    );
    await setLogisticsDirectorAs(
      manager,
      { kind: "MACROEVENT", editionId: ids.editionId },
      { personId: ids.macro, assigned: true, coDirector: false },
    );
    for (const personId of [ids.director, ids.macro]) {
      const [source] = await listLogisticsSources(personId);
      if (!source) throw new Error("No se pudo preparar la fuente logística ficticia.");
      await setReservationGrantAs(manager, {
        sourceKind: source.kind,
        sourceId: source.id,
        enabled: true,
      });
    }
    seedStage = "catalog";
    const microphone = await createItemAs(manager, {
      name: "Micrófono ficticio",
      mode: "UNIT",
      total: 1,
      location: "Bodega de demostración · estante A",
      box: "Caja A1",
    });
    const extension = await createItemAs(manager, {
      name: "Extensión ficticia",
      mode: "UNIT",
      total: 1,
      location: "Bodega de demostración · estante B",
      box: "Caja B1",
    });
    const tape = await createItemAs(manager, {
      name: "Cintas ficticias",
      mode: "QUANTITY",
      total: 20,
      location: "Bodega de demostración · estante C",
      box: "Caja C1",
    });
    const [directorSource] = await listLogisticsSources(ids.director);
    const [macroSource] = await listLogisticsSources(ids.macro);
    if (!directorSource || !macroSource) throw new Error("Faltan los cargos logísticos ficticios.");
    seedStage = "reservations";
    const start = new Date(Date.now() + 86400000);
    const end = new Date(start.getTime() + 3600000);
    const returned = await reserveAs(
      { personId: ids.director, ip: null },
      {
        sourceKind: directorSource.kind,
        sourceId: directorSource.id,
        collectorId: ids.cml,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        lines: [{ itemId: extension.id, quantity: 1 }],
      },
    );
    const incident = await reserveAs(
      { personId: ids.director, ip: null },
      {
        sourceKind: directorSource.kind,
        sourceId: directorSource.id,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        lines: [{ itemId: tape.id, quantity: 5 }],
      },
    );
    const pending = await reserveAs(
      { personId: ids.macro, ip: null },
      {
        sourceKind: macroSource.kind,
        sourceId: macroSource.id,
        startsAt: editionStart.toISOString(),
        endsAt: new Date(editionStart.getTime() + 3600000).toISOString(),
        lines: [{ itemId: microphone.id, quantity: 1 }],
      },
    );
    // Solo esta base ficticia necesita representar dos préstamos ya iniciados. No dependemos de
    // que tres transacciones de una conexión remota terminen dentro de unos milisegundos.
    const fixtureWindow = {
      startsAt: new Date(Date.now() - 300000),
      endsAt: new Date(Date.now() + 6 * 3600000),
    };
    await runCommand(SYSTEM_ACTOR, async (ctx) => {
      await ctx.tx
        .update(inventoryReservation)
        .set(fixtureWindow)
        .where(inArray(inventoryReservation.id, [returned.id, incident.id]));
      for (const id of [returned.id, incident.id]) {
        await ctx.audit({
          action: "inventory.review-fixture-prepared",
          entityType: "inventory_reservation",
          entityId: id,
          after: fixtureWindow,
        });
      }
    });
    seedStage = "movements";
    const reservations = await listReservations(ids.vp);
    const returnedLine = reservations.find((entry) => entry.id === returned.id)?.lines[0];
    const incidentLine = reservations.find((entry) => entry.id === incident.id)?.lines[0];
    if (!returnedLine || !incidentLine) throw new Error("Faltan las líneas de revisión.");
    await checkoutAs(
      { personId: ids.cml, ip: null },
      {
        reservationId: returned.id,
        collectorId: ids.cml,
        requestId: "inventory-review-returned-checkout",
        barcodes: returnedLine.units.map((unit) => unit.barcode),
      },
    );
    await returnAs(
      { personId: ids.cml, ip: null },
      {
        reservationId: returned.id,
        requestId: "inventory-review-returned-return",
        lines: [
          {
            lineId: returnedLine.id,
            quantity: 1,
            unitIds: returnedLine.units.map((unit) => unit.id),
          },
        ],
      },
    );
    const catalog = await readCatalog();
    const tapeBarcode = catalog.find((entry) => entry.id === tape.id)?.barcode;
    if (!tapeBarcode) throw new Error("Falta la etiqueta del material por cantidad.");
    await checkoutAs(
      { personId: ids.cml, ip: null },
      {
        reservationId: incident.id,
        collectorId: ids.director,
        requestId: "inventory-review-incident-checkout",
        barcodes: [tapeBarcode],
      },
    );
    await returnAs(
      { personId: ids.cml, ip: null },
      {
        reservationId: incident.id,
        requestId: "inventory-review-incident-partial",
        note: "Ejemplo ficticio: regresaron tres cintas, una averiada; dos siguen pendientes.",
        lines: [{ lineId: incidentLine.id, quantity: 3, damagedQuantity: 1 }],
      },
    );
    seedStage = "access-ready";
    const report = {
      ...privateData,
      status: "ready",
      scenarios: { pending: pending.id, returned: returned.id, incident: incident.id },
    };
    await access.truncate(0);
    await access.write(`${JSON.stringify(report, null, 2)}\n`, 0, "utf8");
    await access.sync();
    process.stdout.write(
      `${JSON.stringify({ personas: accounts.length, comites: 1, implementos: 3, reservas: 3, novedades: 1 })}\n`,
    );
  } finally {
    await access.close();
  }
}

try {
  await main();
} catch (error) {
  const failure: {
    seedStage: string;
    errorKind: string;
    errorCode?: string;
    constraint?: string;
    message?: string;
  } = {
    seedStage,
    errorKind: error instanceof Error ? error.name : "UnknownError",
  };
  let cause: unknown = error;
  for (let depth = 0; depth < 5 && cause && typeof cause === "object"; depth += 1) {
    const details = cause as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof details.code === "string" && /^[A-Z0-9_]{2,32}$/.test(details.code))
      failure.errorCode = details.code;
    if (typeof details.constraint === "string" && /^[a-z0-9_]+$/.test(details.constraint))
      failure.constraint = details.constraint;
    cause = details.cause;
  }
  if (error instanceof DomainError) failure.message = error.message;
  process.stderr.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
