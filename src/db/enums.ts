import { pgEnum } from "drizzle-orm/pg-core";

// Enums que comparten varios módulos.
export const publicationStatus = pgEnum("publication_status", ["DRAFT", "PUBLISHED"]);
