import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accessGrant, calendarToken, credential, permission } from "../schema";

/** Solo fechas: la consulta ni siquiera selecciona el token o el hash de la contraseña. */
export async function collectOwnIdentityData(personId: string) {
  const db = getDb();
  const [calendars, credentials, permissions, grants] = await Promise.all([
    db
      .select({ createdAt: calendarToken.createdAt, lastUsedAt: calendarToken.lastUsedAt })
      .from(calendarToken)
      .where(eq(calendarToken.personId, personId))
      .limit(1),
    db
      .select({ createdAt: credential.createdAt, updatedAt: credential.updatedAt })
      .from(credential)
      .where(eq(credential.personId, personId))
      .limit(1),
    db.select({ id: permission.id }).from(permission).where(eq(permission.personId, personId)),
    db.select({ id: accessGrant.id }).from(accessGrant).where(eq(accessGrant.personId, personId)),
  ]);
  return {
    calendar: calendars[0] ?? null,
    passwordCredential: credentials[0] ?? null,
    auditSubjects: {
      permission: permissions.map((row) => row.id),
      access_grant: grants.map((row) => row.id),
    },
  };
}
