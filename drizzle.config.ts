import { defineConfig } from "drizzle-kit";

// Cada módulo es dueño de su esquema (ADR-032); drizzle-kit los recoge todos.
export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/db/enums.ts", "./src/modules/*/schema.ts"],
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
