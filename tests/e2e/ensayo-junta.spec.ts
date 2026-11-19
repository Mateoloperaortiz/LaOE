import { type Browser, expect } from "@playwright/test";
import { listCreativeApprovals } from "@/modules/comms";
import { deleteObject } from "@/shared/adapters/storage";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { APP_TIME_ZONE, addDays, atHourIn } from "@/shared/lib/dates-pure";
import { prepareBoardScenarios } from "../review/board-scenarios";
import { test } from "./fixtures";

type Scenarios = Awaited<ReturnType<typeof prepareBoardScenarios>>;

async function signIn(
  browser: Browser,
  session: Scenarios,
  role: Scenarios["accounts"][number]["key"],
  destination: string,
) {
  const account = session.accounts.find((row) => row.key === role);
  if (!account) throw new Error(`Falta la cuenta de ensayo ${role}`);
  const page = await (
    await browser.newContext({ storageState: { cookies: [], origins: [] } })
  ).newPage();
  await page.goto(`/ingresar?next=${encodeURIComponent(destination)}`);
  await page.getByLabel(t("T-042")).fill(account.email);
  await page.getByLabel(t("T-2094"), { exact: true }).fill(account.password);
  await page.getByRole("button", { name: t("T-2095"), exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === new URL(destination, url).pathname);
  return page;
}

test("Mercadeo, su VP y el CCM llevan una pieza del ensayo desde la solicitud hasta la observación", async ({
  browser,
}) => {
  test.slow();
  const session = await prepareBoardScenarios();
  const title = "Primera publicación de la dirección de ensayo";
  const feedback = "Dejar más margen en el borde inferior";
  const [section, titleLabel, channel, caption, file, send] = tList("T-5178");
  const mentoring = tList("T-5186");
  try {
    const marketing = await signIn(
      browser,
      session,
      "marketing",
      `/admin/comites/${session.slug}?area=comunicacion`,
    );
    const pieces = marketing.getByRole("region", { name: section, exact: true });
    await pieces.getByRole("link", { name: send }).click();
    await marketing.getByLabel(titleLabel, { exact: true }).fill(title);
    await marketing.getByLabel(channel, { exact: true }).selectOption("feed");
    await marketing
      .getByLabel(mentoring[2], { exact: true })
      .selectOption({ label: "Dirección de Mercadeo del comité de ensayo" });
    await marketing.getByLabel(caption, { exact: true }).fill("Encuentro del comité");
    await marketing.getByLabel(file, { exact: true }).setInputFiles("public/icons/icon-192.png");
    await marketing.getByRole("button", { name: send, exact: true }).click();
    await expect(marketing.getByRole("status")).toContainText(tList("T-5179")[2]);

    const vp = await signIn(browser, session, "communications", "/admin/mesa");
    await vp.getByRole("link").filter({ hasText: title }).click();
    await vp.getByRole("button", { name: tList("T-5086")[0], exact: true }).click();
    await expect(vp).toHaveURL(/guardado=1/);

    const ccm = await signIn(browser, session, "ccm", "/app/mercadeo");
    await expect(ccm.getByText(mentoring[5], { exact: true })).toBeVisible();
    await marketing.reload();
    await pieces.getByRole("button", { name: tList("T-5182")[1], exact: true }).click();
    await expect(marketing.getByRole("status")).toContainText(tList("T-5182")[2]);
    await ccm.reload();
    const published = ccm.locator("article").filter({ hasText: title });
    await expect(published).toContainText(tList("T-5188")[0].replace("{n}", "1"));
    await published.getByLabel(tList("T-5188")[1]).fill(feedback);
    await published.getByRole("button", { name: mentoring[4] }).click();
    await expect(published).toContainText(feedback);
    await marketing.goto("/app/mercadeo");
    await expect(marketing.locator("article").filter({ hasText: title })).toContainText(feedback);
  } finally {
    for (const piece of await listCreativeApprovals({ committeeId: session.committeeId })) {
      await deleteObject(`creatives/files/${piece.id}/${piece.digest}`);
    }
  }
});

test("las dos direcciones ven el acuerdo de GH y el cruce del comité llega a Administrativa", async ({
  browser,
}) => {
  test.slow();
  const session = await prepareBoardScenarios();
  const week = `/app/coordinacion?fecha=${session.startDay}`;
  const prompts = tList("T-5195");
  const resolution = "DÍAS mueve su ensayo a las once";
  const macro = await signIn(browser, session, "inventiva", week);
  const pair = macro
    .locator("form")
    .filter({ hasText: "Ensayo de DÍAS" })
    .filter({ hasText: "Ensayo de INVENTIVA" });
  await pair.getByLabel(prompts[4]).fill("Las direcciones intentaron mover las dos sesiones.");
  await pair.getByRole("button", { name: prompts[5] }).click();
  await expect(macro.locator("article").filter({ hasText: "Ensayo de DÍAS" })).toContainText(
    prompts[9],
  );
  const gh = await signIn(browser, session, "humanResources", week);
  const reported = gh.locator("article").filter({ hasText: "Ensayo de DÍAS" });
  await reported.getByLabel(prompts[7]).fill(resolution);
  await reported.getByRole("button", { name: prompts[8] }).click();
  await expect(reported).toContainText(resolution);
  const dias = await signIn(browser, session, "dias", week);
  await expect(dias.locator("article").filter({ hasText: "Ensayo de INVENTIVA" })).toContainText(
    resolution,
  );

  const committee = await signIn(browser, session, "general", week);
  const other = committee
    .locator("form")
    .filter({ hasText: "Planeación del comité" })
    .filter({ hasText: "Ensayo de INVENTIVA" });
  await other.getByLabel(prompts[4]).fill("El comité propuso otro horario y aún coincide.");
  await other.getByRole("button", { name: prompts[5] }).click();
  await expect(
    committee.locator("article").filter({ hasText: "Planeación del comité" }),
  ).toContainText(prompts[9]);
  const administrative = await signIn(browser, session, "administrative", week);
  const mixed = administrative.locator("article").filter({ hasText: "Planeación del comité" });
  const committeeResolution = "El comité se reúne a las doce";
  await mixed.getByLabel(prompts[7]).fill(committeeResolution);
  await mixed.getByRole("button", { name: prompts[8] }).click();
  await expect(mixed).toContainText(committeeResolution);
  await committee.reload();
  await expect(
    committee.locator("article").filter({ hasText: "Planeación del comité" }),
  ).toContainText(committeeResolution);
});

test("el préstamo del ensayo pasa de la Mesa a Logística y el CML recibe una de dos unidades", async ({
  browser,
}) => {
  test.slow();
  const session = await prepareBoardScenarios();
  const vp = await signIn(browser, session, "administrative", "/admin/mesa");
  await vp.getByRole("link").filter({ hasText: "Jornada del comité de ensayo" }).click();
  const approval = vp.locator("article").filter({ hasText: "Jornada del comité de ensayo" });
  const due = new Date(atHourIn(APP_TIME_ZONE, addDays(session.endDay, 6), 0).getTime() - 1);
  await expect(approval).toContainText(formatDateTime(due));
  await expect(approval).toContainText("2 × Extensiones de ensayo");
  await approval.getByRole("button", { name: tList("T-5086")[0], exact: true }).click();
  await expect(vp).toHaveURL(/guardado=1/);
  const logistics = await signIn(browser, session, "logistics", "/app/inventario");
  await logistics.getByRole("button", { name: tList("T-5189")[16], exact: true }).click();
  await expect(logistics.getByRole("region", { name: t("T-4405") })).toContainText(
    "2 × Extensiones de ensayo",
  );

  // La recogida se pide al minuto siguiente y el CML solo entrega cuando llega esa hora.
  await expect
    .poll(() => Date.now(), { timeout: 65000, intervals: [1000] })
    .toBeGreaterThanOrEqual(Date.parse(session.pickup));
  const cml = await signIn(browser, session, "cml", "/admin/campo");
  const [inventory, checkout] = tList("T-5070");
  await cml.getByRole("region", { name: inventory }).getByRole("link", { name: checkout }).click();
  const scan = cml.getByLabel(t("T-4369"), { exact: true });
  const add = cml.getByRole("button", { name: t("T-4370"), exact: true });
  await scan.fill(session.barcode);
  await add.click();
  await cml.getByRole("button", { name: t("T-4375"), exact: true }).click();
  const receive = cml.getByRole("button", { name: t("T-4376"), exact: true });
  await expect(receive).toBeVisible();
  await scan.fill(session.barcode);
  await add.click();
  await cml.getByLabel(t("T-4378"), { exact: true }).fill("1");
  await receive.click();
  await expect(cml.getByRole("main").getByRole("status")).toHaveText(t("T-4302"));
  await logistics.reload();
  await expect(logistics.getByRole("region", { name: t("T-4405") })).toContainText(
    `${t("T-4377")}: 1`,
  );
});

test("dos solicitudes de ensayo para la misma sala conservan la ocupación y ambos resultados", async ({
  browser,
}) => {
  test.slow();
  const session = await prepareBoardScenarios();
  const week = `/app/coordinacion?fecha=${session.startDay}`;
  const vp = await signIn(browser, session, "administrative", week);
  const space = "Sala de ensayo",
    catalog = tList("T-5196"),
    booking = tList("T-5197");
  await vp.getByLabel(catalog[1], { exact: true }).fill(space);
  await vp.getByRole("button", { name: catalog[2] }).click();
  await expect(vp.getByText(`${space} · ${catalog[5]}`, { exact: true })).toBeVisible();
  const logistics = await signIn(browser, session, "logistics", week);
  const form = logistics
    .locator("form")
    .filter({ has: logistics.getByRole("heading", { name: booking[0], exact: true }) });
  const first = "Taller del comité",
    second = "Reunión de cierre";
  for (const purpose of [first, second]) {
    await form
      .getByRole("combobox", { name: booking[1], exact: true })
      .selectOption({ label: space });
    await form.getByLabel(booking[3], { exact: true }).fill(`${session.startDay}T10:00`);
    await form.getByLabel(booking[4], { exact: true }).fill(`${session.startDay}T11:00`);
    await form.getByLabel(booking[5], { exact: true }).fill(purpose);
    await form.getByRole("button", { name: booking[6] }).click();
    await expect(logistics.locator("article").filter({ hasText: purpose })).toContainText(
      tList("T-5157")[0],
    );
  }
  await vp.reload();
  const accepted = vp.locator("article").filter({ hasText: first });
  const denied = vp.locator("article").filter({ hasText: second });
  await accepted.getByRole("button", { name: booking[10] }).click();
  await expect(accepted).toContainText(tList("T-5157")[1]);
  await denied.getByRole("button", { name: booking[10] }).click();
  await expect(vp.getByRole("main").getByRole("alert")).toHaveText(t("T-5199"));
  await denied.getByLabel(booking[9]).fill("La sala ya está asignada al taller.");
  await denied.getByRole("button", { name: booking[11] }).click();
  await expect(denied).toContainText(tList("T-5157")[2]);
  await logistics.goto(week);
  await expect(logistics.locator("article").filter({ hasText: second })).toContainText(
    "La sala ya está asignada al taller.",
  );
  await expect(logistics.locator("article").filter({ hasText: first })).toContainText(
    tList("T-5157")[1],
  );
});
