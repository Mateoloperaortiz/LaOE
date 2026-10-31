import type { Metadata } from "next";
import { single } from "@/app/_lib/search";
import { requireAdminActor } from "@/modules/identity";
import { getGamificationLaunch, loadGamificationSettings } from "@/modules/participation";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { ActionForm } from "@/shared/ui/ActionForm";
import { saveLimitsAction } from "./actions";

// Límites y activación (ADR-067 regla 15): topes diario/semanal, premios por defecto y la
// bandera `gamification.enabled`, todo en app_config con auditoría.

export const metadata: Metadata = { title: tList("T-2405")[5] ?? "" };

type Search = Record<string, string | string[] | undefined>;

const inputClass =
  "w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";

export default async function LimitesPage({
  searchParams,
}: PageProps<"/admin/gamificacion/limites">) {
  await requireAdminActor("/admin/gamificacion/limites");
  const search = (await searchParams) as Search;
  const error = single(search.error);
  const guardado = single(search.guardado) === "1";
  const [settings, launch] = await Promise.all([
    loadGamificationSettings(),
    getGamificationLaunch(),
  ]);
  const fields = tList("T-2551");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-display-lg">{tList("T-2405")[5] ?? ""}</h1>
        <p className="text-sm text-tinta-suave">{t("T-2553")}</p>
        <p className="text-sm text-tinta-suave">{t("T-3463")}</p>
        <p className="text-sm font-semibold">
          {launch.launchedAt
            ? t("T-3465", { fecha: formatDateTime(new Date(launch.launchedAt)) })
            : t("T-3464")}
        </p>
        {guardado ? (
          <output className="block font-semibold text-oe-blue">{t("T-2554")}</output>
        ) : null}
        {error ? (
          <p role="alert" className="font-semibold text-oe-orange">
            {error}
          </p>
        ) : null}
      </header>

      <ActionForm action={saveLimitsAction} className="flex flex-col gap-5">
        <AdminFormBody>
          <label className="flex flex-col gap-1">
            <span className="eyebrow text-xs">{fields[0]}</span>
            <input
              name="daily"
              type="number"
              min={0}
              max={1000}
              step={1}
              required
              defaultValue={settings.caps.daily}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow text-xs">{fields[1]}</span>
            <input
              name="weekly"
              type="number"
              min={0}
              max={5000}
              step={1}
              required
              defaultValue={settings.caps.weekly}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow text-xs">{fields[2]}</span>
            <input
              name="trivia"
              type="number"
              min={0}
              max={20}
              step={1}
              required
              defaultValue={settings.defaults.trivia}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow text-xs">{fields[3]}</span>
            <input
              name="presential"
              type="number"
              min={0}
              max={20}
              step={1}
              required
              defaultValue={settings.defaults.presential}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow text-xs">{fields[4]}</span>
            <input
              name="evidence"
              type="number"
              min={0}
              max={20}
              step={1}
              required
              defaultValue={settings.defaults.evidence}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow text-xs">{fields[5]}</span>
            <input
              name="passPercent"
              type="number"
              min={1}
              max={100}
              step={1}
              required
              defaultValue={settings.defaults.passPercent}
              className={inputClass}
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="enabled" value="1" defaultChecked={settings.enabled} />
            {t("T-2552")}
          </label>
          <div className="flex items-center gap-3">
            <AdminSubmitButton type="submit" className="boton-primario">
              {t("T-253")}
            </AdminSubmitButton>
          </div>
        </AdminFormBody>
      </ActionForm>
    </div>
  );
}
