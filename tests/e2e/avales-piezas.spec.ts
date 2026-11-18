import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { listCreativeApprovals } from "@/modules/comms";
import { listCommitteeAnnouncements } from "@/modules/content";
import { appointment, person } from "@/modules/people/schema";
import { deleteObject } from "@/shared/adapters/storage";
import { tList } from "@/shared/copy";
import { seedAppointment, seedCommittee, seedCommitteeMembership, seedTerm } from "../factories";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

for (const destination of ["cartelera", "externo"] as const) {
  test(`el comité publica manualmente la pieza aprobada en su canal: ${destination}`, async ({
    page,
    browser,
  }) => {
    const slug = "teatro-piezas";
    const committeeId = await seedCommittee(slug, "Teatro de prueba");
    const term = await seedTerm();
    const [vp] = await getDb()
      .select({ id: person.id })
      .from(person)
      .where(eq(person.email, E2E_MEMBER_EMAIL));
    if (!vp) throw new Error("Falta la persona de prueba");
    const position = await seedAppointment(vp.id, term, "VP_COMMUNICATIONS");
    const title = "Afiche del festival de teatro";
    const caption = "La función empieza a las seis.";
    const bytes = Buffer.from("%PDF-1.4\nCartel final del festival sintético\n%%EOF");
    const [sectionName, titleLabel, channel, captionLabel, file, send] = tList("T-5178");
    const section = page.getByRole("region", { name: sectionName, exact: true });
    const [publish, record, saved, download] = tList("T-5182");
    const memberContext = await browser.newContext({ storageState: "tests/e2e/.auth/member.json" });
    const member = await memberContext.newPage();
    try {
      await page.goto(`/admin/comites/${slug}?area=comunicacion`);
      await section.getByRole("link", { name: send }).click();
      await page.getByLabel(titleLabel, { exact: true }).fill(title);
      if (destination === "externo") {
        await page.getByLabel(channel, { exact: true }).selectOption("other");
        await page.getByLabel(tList("T-5181")[2], { exact: true }).fill("Red social de Teatro");
      }
      await page.getByLabel(captionLabel, { exact: true }).fill(caption);
      await page
        .getByLabel(file, { exact: true })
        .setInputFiles({ name: "afiche.pdf", mimeType: "application/pdf", buffer: bytes });
      await page.getByRole("button", { name: send, exact: true }).click();
      await expect(page.getByRole("status")).toContainText(tList("T-5179")[2]);
      await expect(section.getByRole("button", { name: publish })).toHaveCount(0);
      const origin = new URL(page.url()).origin;
      await member.goto(`${origin}/admin/mesa`);
      await member.getByRole("link").filter({ hasText: title }).click();
      const attachment = await member
        .getByRole("link", { name: `${file} · afiche.pdf` })
        .getAttribute("href");
      if (!attachment) throw new Error("Falta el archivo para decidir");
      const url = new URL(attachment, origin).href;
      expect(await (await member.request.get(url)).body()).toEqual(bytes);
      await member.getByRole("button", { name: tList("T-5086")[0], exact: true }).click();
      await expect(member).toHaveURL(/guardado=1/);
      expect(await listCommitteeAnnouncements(committeeId)).toHaveLength(0);
      await getDb().delete(appointment).where(eq(appointment.id, position));
      expect((await member.request.get(url, { maxRedirects: 0 })).status()).toBe(404);
      await page.reload();
      await section
        .getByRole("button", { name: destination === "cartelera" ? publish : record, exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText(saved);
      expect((await member.request.get(url, { maxRedirects: 0 })).status()).toBe(404);
      await seedCommitteeMembership(vp.id, committeeId, term);
      await member.goto(`${origin}/app/comites/${slug}`);
      if (destination === "cartelera") {
        await member.getByRole("link", { name: title, exact: true }).click();
        await expect(member.getByText(caption, { exact: true })).toBeVisible();
        await expect(member.getByRole("link", { name: download })).toHaveAttribute(
          "href",
          attachment,
        );
        expect(await (await member.request.get(url)).body()).toEqual(bytes);
      } else {
        await expect(member.getByRole("link", { name: title })).toHaveCount(0);
        expect((await member.request.get(url, { maxRedirects: 0 })).status()).toBe(404);
      }
    } finally {
      await memberContext.close();
      for (const piece of await listCreativeApprovals({ committeeId }))
        await deleteObject(`creatives/files/${piece.id}/${piece.digest}`);
    }
  });
}
