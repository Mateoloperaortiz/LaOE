import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createdAt, id, timestampTz, updatedAt } from "@/db/columns";
import { committee, person } from "@/modules/people/schema";

// Acceso por correo del roster y sesión opaca en servidor (ADR-010, ADR-011). Desde ADR-051 la
// credencial es una contraseña propia y el OTP queda como método alterno.

export const permissionCode = pgEnum("permission_code", ["ADMIN", "COMMITTEE_LEADER", "BOARD"]);
export const otpPurpose = pgEnum("otp_purpose", ["LOGIN", "STEP_UP"]);
export const accessGrantKind = pgEnum("access_grant_kind", ["ACTIVATION", "RECOVERY"]);

export const session = pgTable(
  "session",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    tokenHash: text().notNull(),
    expiresAt: timestampTz().notNull(),
    remembered: boolean().notNull().default(false),
    otpVerifiedAt: timestampTz().notNull(), // ventana de step-up (15 minutos)
    userAgent: text(),
    ip: text(),
    lastSeenAt: timestampTz().notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("session_token_hash_unique").on(t.tokenHash),
    index("session_person_idx").on(t.personId),
    index("session_expires_idx").on(t.expiresAt),
  ],
);

export const otpChallenge = pgTable(
  "otp_challenge",
  {
    id: id(),
    email: text().notNull(),
    purpose: otpPurpose().notNull().default("LOGIN"),
    codeHash: text().notNull(),
    expiresAt: timestampTz().notNull(),
    attempts: integer().notNull().default(0),
    maxAttempts: integer().notNull().default(5),
    consumedAt: timestampTz(),
    ip: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("otp_challenge_email_idx").on(t.email, t.createdAt),
    index("otp_challenge_ip_idx").on(t.ip, t.createdAt),
  ],
);

// Contraseña propia (ADR-051). El hash lleva sus parámetros adentro (`scrypt$N$r$p$sal$hash`),
// así que subirlos después no exige migración. Nunca se guarda ni se registra en claro.
export const credential = pgTable(
  "credential",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    passwordHash: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("credential_person_unique").on(t.personId)],
);

// Enlace de un solo uso que emite la junta fuera del correo (ADR-051): en base va solo el
// SHA-256 del token, que en claro existe únicamente en la URL y en la pantalla de quien lo emite.
export const accessGrant = pgTable(
  "access_grant",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    kind: accessGrantKind().notNull(),
    tokenHash: text().notNull(),
    issuedById: text().references(() => person.id, { onDelete: "set null" }),
    expiresAt: timestampTz().notNull(),
    consumedAt: timestampTz(),
    consumedIp: text(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("access_grant_token_hash_unique").on(t.tokenHash),
    index("access_grant_person_idx").on(t.personId, t.createdAt),
    index("access_grant_expires_idx").on(t.expiresAt),
  ],
);

// Límite de intentos del ingreso y del step-up (ADR-051). Tabla propia y no una columna de
// `credential` porque el límite tiene que funcionar también para correos que no existen. Quien ya
// tiene sesión cuenta aparte (ADR-114, regla 2): en sus filas `email` no lleva un correo sino la
// clave de la persona (`personAttemptKey`), que ningún correo normalizado puede igualar.
export const loginAttempt = pgTable(
  "login_attempt",
  {
    id: id(),
    email: text().notNull(),
    ip: text(),
    succeeded: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("login_attempt_email_idx").on(t.email, t.createdAt),
    index("login_attempt_ip_idx").on(t.ip, t.createdAt),
  ],
);

export const permission = pgTable(
  "permission",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    code: permissionCode().notNull(),
    committeeId: text().references(() => committee.id, { onDelete: "cascade" }),
    grantedById: text().references(() => person.id, { onDelete: "set null" }),
    grantedAt: createdAt(),
  },
  (t) => [
    uniqueIndex("permission_global_unique")
      .on(t.personId, t.code)
      .where(sql`${t.committeeId} is null`),
    uniqueIndex("permission_committee_unique")
      .on(t.personId, t.code, t.committeeId)
      .where(sql`${t.committeeId} is not null`),
    // Solo COMMITTEE_LEADER lleva comité; ADMIN y BOARD nunca.
    check(
      "permission_committee_scope",
      sql`(${t.code} = 'COMMITTEE_LEADER') = (${t.committeeId} is not null)`,
    ),
  ],
);

// Token del calendario personal (ADR-038 regla 12): capacidad de solo lectura sobre la agenda propia,
// en claro para que Ajustes muestre siempre la URL; regenerarlo invalida el anterior.
export const calendarToken = pgTable(
  "calendar_token",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    token: text().notNull(),
    createdAt: createdAt(),
    lastUsedAt: timestampTz(),
  },
  (t) => [
    uniqueIndex("calendar_token_person_unique").on(t.personId),
    uniqueIndex("calendar_token_token_unique").on(t.token),
  ],
);

// Carnet persistente en billeteras: el token se conserva en claro para volver a emitir el pase.
// El epoch corta el acceso al salir; la revisión distingue las rotaciones dentro de esa membresía.
export const carnetToken = pgTable(
  "carnet_token",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    token: text().notNull(),
    walletEpoch: integer().notNull(),
    revision: integer().notNull().default(1),
    createdAt: createdAt(),
    lastUsedAt: timestampTz(),
  },
  (t) => [
    uniqueIndex("carnet_token_person_unique").on(t.personId),
    uniqueIndex("carnet_token_token_unique").on(t.token),
  ],
);
