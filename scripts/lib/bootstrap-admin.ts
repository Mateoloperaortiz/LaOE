import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { getEnv } from "@/env";
import { permission } from "@/modules/identity/schema";
import { isInstitutionalEmail, personInputSchema } from "@/modules/people";
import { membership, person } from "@/modules/people/schema";
import { createTerm, semesterFromCode, TERM_CODE } from "@/modules/terms";
import { term } from "@/modules/terms/schema";

// Excepción de arranque (ADR-039): un único acceso real, sin roster, comités, consentimiento ni
// bienvenida. Los datos vienen de Mateo en un JSON privado; nunca del seed ni de GHPOINTS.

const firstTermSchema = z
  .object({
    code: z.string().trim().regex(TERM_CODE),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
  })
  .strict()
  .refine((input) => input.startsOn < input.endsOn, {
    message: "El inicio del término debe ser anterior al fin",
  });

export const bootstrapAdminInputSchema = personInputSchema
  .pick({ firstName: true, lastName: true, email: true })
  .extend({ firstTerm: firstTermSchema })
  .strict();

export type BootstrapAdminInput = z.infer<typeof bootstrapAdminInputSchema>;

export interface BootstrapAdminResult {
  status: "created" | "already-exists";
  personId: string;
}

/** Mensajes operativos controlados, imprimibles sin revelar los inputs privados. */
export class BootstrapAdminError extends Error {}

/** Cada lectura y escritura del bootstrap usa la misma transacción; no hay un alta parcial. */
export async function bootstrapAdmin(raw: unknown): Promise<BootstrapAdminResult> {
  const input = bootstrapAdminInputSchema.parse(raw);
  if (!isInstitutionalEmail(input.email, getEnv().INSTITUTIONAL_EMAIL_DOMAINS)) {
    throw new BootstrapAdminError("El primer ADMIN necesita un correo institucional permitido");
  }

  return runCommand(SYSTEM_ACTOR, async (ctx) => {
    await ctx.tx.execute(sql`select pg_advisory_xact_lock(hashtext('bootstrap:first-admin'))`);
    const admins = await ctx.tx
      .select({ personId: person.id, email: person.email })
      .from(permission)
      .innerJoin(person, eq(person.id, permission.personId))
      .where(eq(permission.code, "ADMIN"));
    if (admins.length > 0) {
      const existing = admins.find((row) => row.email === input.email);
      if (existing) {
        return { status: "already-exists", personId: existing.personId };
      }
      throw new BootstrapAdminError(
        "Ya existe un ADMIN: los demás permisos se conceden desde la app",
      );
    }

    const [existingPerson] = await ctx.tx
      .select({ id: person.id })
      .from(person)
      .where(eq(person.email, input.email))
      .limit(1);
    if (existingPerson) {
      throw new BootstrapAdminError(
        "El correo ya pertenece a una persona sin ADMIN; el bootstrap no la modifica",
      );
    }

    const [existingTerm] = await ctx.tx
      .select()
      .from(term)
      .where(eq(term.code, input.firstTerm.code))
      .limit(1);
    if (
      existingTerm &&
      (existingTerm.startsOn !== input.firstTerm.startsOn ||
        existingTerm.endsOn !== input.firstTerm.endsOn ||
        existingTerm.semester !== semesterFromCode(input.firstTerm.code))
    ) {
      throw new BootstrapAdminError(
        "El término ya existe con otras fechas; el bootstrap no lo modifica",
      );
    }
    const firstTerm =
      existingTerm ??
      (await createTerm(ctx, {
        ...input.firstTerm,
        requiredOrdinaryAssemblies: 1,
        permanenceGeneralNominal: 50,
        permanenceCommitteeNominal: 60,
      }));

    const values = {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      kind: "STUDENT" as const,
      stage: "MEMBER" as const,
      source: "BOOTSTRAP",
    };
    const [createdPerson] = await ctx.tx.insert(person).values(values).returning({ id: person.id });
    if (!createdPerson) {
      throw new Error("No se pudo crear la persona del primer ADMIN");
    }
    await ctx.audit({
      action: "person.created",
      entityType: "person",
      entityId: createdPerson.id,
      after: values,
    });

    const [createdMembership] = await ctx.tx
      .insert(membership)
      .values({ personId: createdPerson.id, status: "ACTIVE", firstTermId: firstTerm.id })
      .returning({ id: membership.id });
    if (!createdMembership) {
      throw new Error("No se pudo crear la membresía del primer ADMIN");
    }
    await ctx.audit({
      action: "membership.created",
      entityType: "membership",
      entityId: createdMembership.id,
      after: {
        personId: createdPerson.id,
        status: "ACTIVE",
        firstTermId: firstTerm.id,
        source: "BOOTSTRAP",
      },
    });

    // grantPermission busca por getDb(), que no ve esta persona sin confirmar. Esta excepción
    // escribe aquí el mismo permiso global, auditoría y evento, manteniendo el commit atómico.
    const [createdPermission] = await ctx.tx
      .insert(permission)
      .values({ personId: createdPerson.id, code: "ADMIN", committeeId: null, grantedById: null })
      .returning({ id: permission.id });
    if (!createdPermission) {
      throw new Error("No se pudo crear el permiso del primer ADMIN");
    }
    const grant = { personId: createdPerson.id, code: "ADMIN", committeeId: null };
    await ctx.audit({
      action: "permission.granted",
      entityType: "permission",
      entityId: createdPermission.id,
      after: grant,
    });
    await ctx.emit({ type: "permission.granted", payload: { actorId: null, ...grant } });

    return { status: "created", personId: createdPerson.id };
  });
}
