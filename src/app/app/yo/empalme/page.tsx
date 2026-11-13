import type { Metadata } from "next";
import { single } from "@/app/_lib/search";
import { requireActor } from "@/modules/identity";
import { listHandoverDocsFor } from "@/modules/people";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { t, tList } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";
import { ActionForm } from "@/shared/ui/ActionForm";
import { Markdown } from "@/shared/ui/Markdown";
import { saveHandoverAction, verifyHandoverAction } from "./actions";

// «Tu empalme» (ADR-172): el documento de cada cargo que la persona tiene o va a tener. Quien tiene el
// cargo este semestre lo edita y lo verifica; quien lo recibe el siguiente lo lee.

export const metadata: Metadata = { title: tList("T-4954")[0] ?? "" };

export default async function EmpalmePage({ searchParams }: PageProps<"/app/yo/empalme">) {
  const actor = await requireActor("/app/yo/empalme");
  const search = await searchParams;
  const error = single(search.error);
  const saved = single(search.guardado) === "1";
  const docs = await listHandoverDocsFor(actor.personId);
  const [titulo, intro, vacio] = tList("T-4954");
  const [guardar, verificar, sinVerificar, sinNada, quienEscribe] = tList("T-4955");
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="titulo-pantalla">{titulo}</h1>
        <p className="text-secundario text-tinta-secundaria">{intro}</p>
      </header>
      {saved ? <output className="block font-semibold text-titulo">{t("T-259")}</output> : null}
      {error ? (
        <p role="alert" className="font-semibold text-oe-orange">
          {error}
        </p>
      ) : null}
      {docs.length === 0 ? <p className="text-tinta-secundaria">{vacio}</p> : null}
      {docs.map((doc) => {
        const id = `${doc.committeeId}-${doc.roleCode}`;
        return (
          <section
            key={id}
            id={doc.committeeId}
            aria-labelledby={`empalme-${id}`}
            className="flex flex-col gap-3 rounded-tarjeta bg-superficie p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={`empalme-${id}`} className="titulo-seccion">
                {doc.roleLabel} · {doc.committeeName}
              </h2>
              <span className="etiqueta-corta text-tinta-secundaria">
                {doc.verifiedAt
                  ? t("T-4959", {
                      fecha: formatDate(doc.verifiedAt),
                      nombre: doc.verifiedByName ?? "",
                    })
                  : sinVerificar}
              </span>
            </div>
            {doc.canEdit ? (
              <>
                <ActionForm action={saveHandoverAction} className="flex flex-col gap-2">
                  <input type="hidden" name="committeeId" value={doc.committeeId} />
                  <input type="hidden" name="roleCode" value={doc.roleCode} />
                  <label htmlFor={`cuerpo-${id}`} className="sr-only">
                    {doc.roleLabel}
                  </label>
                  <textarea
                    id={`cuerpo-${id}`}
                    name="body"
                    rows={10}
                    defaultValue={doc.body}
                    className="rounded-xl border border-borde bg-fondo p-3 font-mono text-sm"
                  />
                  <AdminSubmitButton type="submit" className="boton-primario self-start">
                    {guardar}
                  </AdminSubmitButton>
                </ActionForm>
                {doc.body && !doc.verifiedAt ? (
                  <ActionForm action={verifyHandoverAction}>
                    <input type="hidden" name="committeeId" value={doc.committeeId} />
                    <input type="hidden" name="roleCode" value={doc.roleCode} />
                    <AdminSubmitButton type="submit" className="boton-secundario">
                      {verificar}
                    </AdminSubmitButton>
                  </ActionForm>
                ) : null}
              </>
            ) : doc.body ? (
              <Markdown source={doc.body} />
            ) : (
              <p className="text-tinta-secundaria">
                {sinNada} {quienEscribe}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
