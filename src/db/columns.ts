import { createId } from "@paralleldrive/cuid2";
import { text, timestamp } from "drizzle-orm/pg-core";

// Columnas comunes a todas las tablas (03-modelo-de-datos.md): ids cuid2 generados en la app
// y timestamps con zona horaria en UTC (ADR-020).

export const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => createId());

export const timestampTz = () => timestamp({ withTimezone: true, mode: "date" });

export const createdAt = () => timestampTz().notNull().defaultNow();

export const updatedAt = () =>
  timestampTz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
