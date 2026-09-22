import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { occasion } from "@/modules/participation/schema";
import { term } from "@/modules/terms/schema";
import { t } from "@/shared/copy";
import { copyPattern, itemPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";

// Avisos de permanencia en Mi OE (ADR-036 regla 11): una asamblea obligatoria `e2e-` en las próximas
// 24 horas produce el aviso T-183 en el inicio y en /app/permanencia sin ningún job de por medio.

test.use({ storageState: "tests/e2e/.auth/member.json" });

test.beforeEach(async () => {
  const db = getDb();
  const [current] = await db.select({ id: term.id }).from(term).where(eq(term.code, E2E_TERM.code));
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
  // En Mi OE el aviso une título y cuerpo con un punto (noticeText en src/app/app/_ui/avisos.ts).
  const aviso = itemPattern(t("T-183", { lugar: "Auditorio e2e" }).replace(" · ", ". "));
  await page.goto("/app");
  const barra = page.getByRole("region", { name: t("T-110") });
  await expect(barra.getByText(aviso)).toBeVisible();
  await sinViolaciones(page);

  await page.goto("/app/permanencia");
  await expect(page.getByText(aviso)).toBeVisible();
  await expect(page.getByText(copyPattern("T-124"))).toBeVisible();
  await sinViolaciones(page);
});
