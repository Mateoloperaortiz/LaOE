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
import { createdAt, id, timestampTz } from "@/db/columns";
import { committee, person } from "@/modules/people/schema";

// Acceso por correo del roster con OTP y sesión opaca en servidor (ADR-010, ADR-011).

export const permissionCode = pgEnum("permission_code", ["ADMIN", "COMMITTEE_LEADER", "BOARD"]);
export const otpPurpose = pgEnum("otp_purpose", ["LOGIN", "STEP_UP"]);

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
