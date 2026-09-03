import { pgEnum } from "drizzle-orm/pg-core";

// Enums que comparten varios módulos.
export const publicationStatus = pgEnum("publication_status", ["DRAFT", "PUBLISHED"]);

/** A quién se dirige un contenido: a cualquiera o solo a miembros con sesión (ADR-033). */
export const audience = pgEnum("audience", ["PUBLIC", "MEMBERS"]);
