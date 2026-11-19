import { expect } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { event } from "@/modules/events/schema";
import { appointment, person } from "@/modules/people/schema";
import { tList } from "@/shared/copy";
import {
  APP_TIME_ZONE,
  addDays,
  atHourIn,
  dateKeyIn,
  utcToZonedInput,
} from "@/shared/lib/dates-pure";
import {
  seedAppointment,
  seedCommittee,
  seedCommitteeMembership,
  seedEdition,
  seedEvent,
  seedMacroeventDirector,
  seedOccasion,
  seedTerm,
} from "../factories";
import { test } from "./fixtures";
import { E2E_EMAIL, E2E_MEMBER_EMAIL } from "./global-setup";

test.use({ storageState: "tests/e2e/.auth/member.json" });
test("Logística pide un espacio y las direcciones elevan a GH un cruce de macroeventos desde Mi OE", async ({
  page,
  browser,
}) => {
  test.slow();
  const term = await seedTerm();
  const [admin] = await getDb()
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_EMAIL));
  const [member] = await getDb()
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  if (!admin || !member) throw Error("Faltan las sesiones de prueba");
  const stamp = Date.now().toString(36),
    space = "Sala de ensayo " + stamp;
  const day = addDays(dateKeyIn(APP_TIME_ZONE, new Date()), 2),
    start = atHourIn(APP_TIME_ZONE, day, 10),
    end = atHourIn(APP_TIME_ZONE, day, 11);
  const roles: string[] = [];
  const board = await browser.newContext({ storageState: "tests/e2e/.auth/admin.json" });
  const c = tList("T-5195"),
    s = tList("T-5196"),
    b = tList("T-5197");
  try {
    const vp = await board.newPage();
    roles.push(await seedAppointment(admin.id, term, "VP_ADMIN"));
    const committee = await seedCommittee("log-espacio-" + stamp);
    await seedCommitteeMembership(member.id, committee, term, "LOGISTICA");
    await page.goto("/app/yo");
    await page.getByRole("link", { name: c[0], exact: true }).click();
    const origin = new URL(page.url()).origin;
    await vp.goto(origin + "/app/coordinacion");
    await vp.getByLabel(s[1], { exact: true }).fill(space);
    await vp.getByRole("button", { name: s[2] }).click();
    await expect(vp.getByText(space + " · " + s[5], { exact: true })).toBeVisible();
    await page.reload();
    const request = page
      .locator("form")
      .filter({ has: page.getByRole("heading", { name: b[0], exact: true }) });
    await request.getByRole("combobox", { name: b[1], exact: true }).selectOption({ label: space });
    await request.getByLabel(b[3], { exact: true }).fill(utcToZonedInput(start, APP_TIME_ZONE));
    await request.getByLabel(b[4], { exact: true }).fill(utcToZonedInput(end, APP_TIME_ZONE));
    await request.getByLabel(b[5], { exact: true }).fill("Ensayo de coordinación");
    await request.getByRole("button", { name: b[6] }).click();
    await expect(
      page.getByRole("heading", { name: space + " · " + tList("T-5157")[0] }),
    ).toBeVisible();
    await vp.reload();
    await vp
      .locator("article")
      .filter({ hasText: space })
      .getByRole("button", { name: b[10] })
      .click();
    await expect(
      vp.getByRole("heading", { name: space + " · " + tList("T-5157")[1] }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: space + " · " + tList("T-5157")[1] }),
    ).toBeVisible();
    roles.push(await seedAppointment(admin.id, term, "VP_GH"));
    for (const slug of ["inventiva", "dias-eafit"]) {
      const [known] = await getDb()
        .select({ id: event.id })
        .from(event)
        .where(eq(event.slug, slug));
      const ed = await seedEdition(
        known?.id ?? (await seedEvent(slug, slug)),
        slug + "-" + stamp,
        "Edición " + stamp,
      );
      await seedOccasion(term, {
        title: slug + " " + stamp,
        kind: "EDITION_SESSION",
        editionId: ed,
        status: "DRAFT",
        startsAt: start,
        endsAt: end,
      });
      if (slug === "inventiva")
        roles.push(await seedMacroeventDirector(member.id, term, ed, "GESTION_HUMANA"));
    }
    await page.goto("/app/coordinacion?fecha=" + day);
    const pair = page
      .locator("form")
      .filter({ hasText: "inventiva " + stamp })
      .filter({ hasText: "dias-eafit " + stamp });
    await pair.getByLabel(c[4]).fill("Las dos direcciones siguieron sin acordar una hora");
    await pair.getByRole("button", { name: c[5] }).click();
    const caseTitle = "dias-eafit " + stamp,
      decision = "DÍAS cambia el ensayo a las once";
    await expect(page.locator("article").filter({ hasText: caseTitle })).toContainText(c[9]);
    await vp.goto(origin + "/app/coordinacion?fecha=" + day);
    const reported = vp
      .locator("article")
      .filter({ hasText: caseTitle })
      .filter({ hasText: "inventiva " + stamp });
    await reported.getByLabel(c[7], { exact: true }).fill(decision);
    await reported.getByRole("button", { name: c[8] }).click();
    await expect(reported).toContainText(decision);
    await page.reload();
    await expect(page.locator("article").filter({ hasText: caseTitle })).toContainText(decision);
  } finally {
    await board.close();
    if (roles.length) await getDb().delete(appointment).where(inArray(appointment.id, roles));
    await closeDb();
  }
});
