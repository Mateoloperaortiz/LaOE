import { requireActor } from "@/modules/identity";
import { BarraTitulo, Elemento } from "@/shared/brand";
import { t } from "@/shared/copy";

export default async function AppHome() {
  const actor = await requireActor("/app");
  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-display-lg">{t("T-060", { "nombre preferido": actor.name })}</h1>
      <section aria-labelledby="agenda" className="flex flex-col gap-6">
        <BarraTitulo color="azul" className="self-start">
          <span id="agenda">{t("T-062")}</span>
        </BarraTitulo>
        <div className="flex items-center gap-6 rounded-[var(--radius-cartel)] border border-borde bg-fondo-suave p-6 textura-granito">
          <Elemento tipo="destello" className="size-12 shrink-0 text-oe-orange" />
          <p className="text-lg">{t("T-063")}</p>
        </div>
      </section>
    </div>
  );
}
