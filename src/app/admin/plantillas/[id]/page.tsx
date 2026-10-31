import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTemplate, previewTemplateFor } from "@/modules/comms";
import { requireAdminActor } from "@/modules/identity";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { BarraTitulo } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { ActionForm } from "@/shared/ui/ActionForm";
import { sendTestAction } from "./actions";

// Vista previa de una plantilla con los datos del actor (ADR-038 regla 8) y "Enviarme una prueba".
// Se inserta el fragmento del cuerpo (`preview`), nunca el documento completo: al insertar un `<body>`
// con estilos el navegador se los aplica a la página (en oscuro desaparecían título, asunto y botones).

const ID = /^[a-z0-9]{10,40}$/;

export async function generateMetadata({
  params,
}: PageProps<"/admin/plantillas/[id]">): Promise<Metadata> {
  const { id } = await params;
  const template = ID.test(id) ? await getTemplate(id) : null;
  return { title: template?.name ?? t("T-1115") };
}

export default async function Page({ params, searchParams }: PageProps<"/admin/plantillas/[id]">) {
  const { id } = await params;
  const actor = await requireAdminActor(`/admin/plantillas/${id}`);
  const template = ID.test(id) ? await getTemplate(id) : null;
  if (!template) {
    notFound();
  }
  const search = await searchParams;
  const prueba = typeof search.prueba === "string" ? search.prueba : "";
  const pruebaRechazada = typeof search.pruebaRechazada === "string" ? search.pruebaRechazada : "";
  const preview = await previewTemplateFor(id, actor.personId);
  const [colIdentificador, , colAsunto] = tList("T-1116");
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="eyebrow">
          <Link href="/admin/plantillas">{t("T-1115")}</Link> · {colIdentificador}: {template.slug}
        </p>
        <BarraTitulo nivel="h1" color="azul" className="self-start">
          {template.name}
        </BarraTitulo>
        <p className="text-tinta-suave">
          {colAsunto}:{" "}
          <span className="font-semibold text-tinta">{preview?.subject ?? template.subject}</span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/admin/plantillas?editar=${template.id}`}
            className="boton-secundario text-sm"
          >
            {t("T-252")}
          </Link>
          <ActionForm action={sendTestAction}>
            <AdminFormBody>
              <input type="hidden" name="templateId" value={template.id} />
              <AdminSubmitButton type="submit" className="boton-primario text-sm">
                {t("T-1120")}
              </AdminSubmitButton>
            </AdminFormBody>
          </ActionForm>
          {prueba ? (
            <output className="text-sm font-semibold text-titulo">
              {t("T-1121", { correo: prueba })}
            </output>
          ) : null}
          {pruebaRechazada ? (
            <p role="alert" className="text-sm font-semibold text-titulo">
              {t("T-3250", { correo: pruebaRechazada })}
            </p>
          ) : null}
        </div>
      </header>

      <section aria-labelledby="vista-previa" className="flex flex-col gap-4">
        <BarraTitulo color="amarillo" className="self-start">
          <span id="vista-previa">{t("T-1119")}</span>
        </BarraTitulo>
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-1118")}</p>
        {preview ? (
          <div
            className="overflow-x-auto rounded-[var(--radius-cartel)] border border-borde bg-white text-black"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML generado por la app desde Markdown escapado (ADR-038 regla 8)
            dangerouslySetInnerHTML={{ __html: preview.preview }}
          />
        ) : null}
      </section>
    </div>
  );
}
