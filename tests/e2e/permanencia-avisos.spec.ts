import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { occasion } from "@/modules/participation/schema";
import { term } from "@/modules/terms/schema";
import { sinViolaciones } from "./axe";

// Avisos de permanencia en Mi OE (ADR-036 regla 11): una asamblea obligatoria `e2e-` en las próximas
// 24 horas produce el aviso T-183 en el inicio y en /app/permanencia sin ningún job de por medio.

test.use({ storageState: "tests/e2e/.auth/member.json" });

test.beforeAll(async () => {
  const db = getDb();
  const [current] = await db.select({ id: term.id }).from(term).where(eq(term.code, "2026-2"));
  if (!current) throw new Error("sin término");
  const now = Date.now();
  await db.insert(occasion).values({
    termId: current.id,
    publicId: `e2ea${String(now % 1_000_000).padStart(6, "0")}`,
    title: "e2e-Asamblea ordinaria de aviso",
    kind: "ASSEMBLY",
    assemblyKind: "ORDINARY",
    category: "OTHER",
    location: "Auditorio e2e",
    points: 0,
    status: "OPEN",
    startsAt: new Date(now + 12 * 3_600_000),
    checkInOpensAt: new Date(now + 11 * 3_600_000),
    checkInClosesAt: new Date(now + 14 * 3_600_000),
  });
  await closeDb();
});

test("el miembro ve el aviso de la asamblea obligatoria en el inicio y en su permanencia", async ({
  page,
}) => {
  await page.goto("/app");
  const barra = page.getByRole("region", { name: "Permanencia" });
  await expect(
    barra.getByText(
      /Asamblea obligatoria .* en Auditorio e2e\. Recordá que faltar implica salir de la OE/,
    ),
  ).toBeVisible();
  await sinViolaciones(page);

  await page.goto("/app/permanencia");
  await expect(page.getByText(/Asamblea obligatoria .* en Auditorio e2e/)).toBeVisible();
  await expect(page.getByText(/Asambleas obligatorias: \d+ de \d+/)).toBeVisible();
  await sinViolaciones(page);
});
