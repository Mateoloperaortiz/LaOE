import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { appointment, person } from "@/modules/people/schema";
import { getCurrentTerm } from "@/modules/terms";
import { seedAppointment, seedMember, seedTerm } from "../factories";

// Quien decide por la VP de Gestión Humana (ADR-196): registra, avala y anula sanciones, que ADMIN ya
// no toca. Las pruebas que antes sancionaban como ADMIN sancionan como ella. Es idempotente: una sola
// persona por base, con su cargo en el término vigente.

export const GH_EMAIL = "vp.gh.pruebas@eafit.edu.co";

export async function ghActor(): Promise<{ personId: string; ip: null }> {
  // El cargo es del término vigente: si la prueba todavía no lo sembró, se siembra (es idempotente).
  await seedTerm();
  const term = await getCurrentTerm();
  if (!term) throw new Error("ghActor: sin término vigente nadie decide por la VP de GH");
  const [existing] = await getDb()
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, GH_EMAIL));
  const personId =
    existing?.id ??
    (await seedMember(GH_EMAIL, { firstName: "Vicepresidencia", lastName: "de Gestión Humana" }));
  const [cargo] = await getDb()
    .select({ id: appointment.id })
    .from(appointment)
    .where(
      and(
        eq(appointment.personId, personId),
        eq(appointment.termId, term.id),
        eq(appointment.kind, "VP_GH"),
      ),
    );
  if (!cargo) await seedAppointment(personId, term.id, "VP_GH");
  return { personId, ip: null };
}
