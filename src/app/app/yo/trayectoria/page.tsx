import type { Metadata } from "next";
import { single } from "@/app/_lib/search";
import { getEnv } from "@/env";
import { linkedInAddUrl, listTrajectory } from "@/modules/crm";
import { requireActor } from "@/modules/identity";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { t, tList } from "@/shared/copy";
import { ActionForm } from "@/shared/ui/ActionForm";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { publishAction, revokeAction } from "./actions";

// La trayectoria verificable (ADR-171): lo que la persona hizo en la OE, del semestre más reciente al
// más viejo. Nada se publica por defecto: cada elemento se publica o se deja de publicar por separado.

export const metadata: Metadata = { title: tList("T-4947")[0] ?? "" };

export default async function TrayectoriaPage({ searchParams }: PageProps<"/app/yo/trayectoria">) {
  const actor = await requireActor("/app/yo/trayectoria");
  const error = single((await searchParams).error);
  const items = await listTrajectory(actor.personId);
  const [titulo, intro, vacio] = tList("T-4947");
  const [publicar, despublicar, verPagina, linkedin, publicada] = tList("T-4948");
  const appUrl = getEnv().APP_URL;
  const organization = t("T-001");
  const terms = [...new Set(items.map((item) => item.termCode))];
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="titulo-pantalla">{titulo}</h1>
        <p className="text-secundario text-tinta-secundaria">{intro}</p>
      </header>
      {error ? (
        <p role="alert" className="font-semibold text-oe-orange">
          {error}
        </p>
      ) : null}
      {items.length === 0 ? <p className="text-tinta-secundaria">{vacio}</p> : null}
      {terms.map((term) => (
        <section key={term} aria-labelledby={`semestre-${term}`} className="flex flex-col gap-2">
          <h2 id={`semestre-${term}`} className="titulo-seccion">
            {term}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {items
              .filter((item) => item.termCode === term)
              .map((item) => {
                const url = item.credential
                  ? `${appUrl}/verificar/${item.credential.publicId}`
                  : "";
                return (
                  <li
                    key={`${item.kind}-${item.sourceId}`}
                    className="flex flex-col gap-2 rounded-tarjeta bg-superficie p-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold">{item.title}</span>
                      {item.credential ? (
                        <span className="etiqueta-corta text-tinta-secundaria">{publicada}</span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.credential ? (
                        <>
                          <Link
                            href={`/verificar/${item.credential.publicId}`}
                            className="boton-secundario min-h-11 px-4 py-2 text-sm"
                          >
                            {verPagina}
                          </Link>
                          <a
                            href={linkedInAddUrl({
                              title: item.title,
                              organization,
                              publishedAt: item.credential.publishedAt,
                              url,
                              certId: item.credential.publicId,
                            })}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="boton-primario min-h-11 px-4 py-2 text-sm"
                          >
                            {linkedin}
                          </a>
                          <ActionForm action={revokeAction}>
                            <input type="hidden" name="publicId" value={item.credential.publicId} />
                            <AdminSubmitButton
                              type="submit"
                              className="boton-secundario min-h-11 px-4 py-2 text-sm"
                            >
                              {despublicar}
                            </AdminSubmitButton>
                          </ActionForm>
                        </>
                      ) : (
                        <ActionForm action={publishAction}>
                          <input type="hidden" name="kind" value={item.kind} />
                          <input type="hidden" name="sourceId" value={item.sourceId} />
                          <AdminSubmitButton
                            type="submit"
                            className="boton-primario min-h-11 px-4 py-2 text-sm"
                          >
                            {publicar}
                          </AdminSubmitButton>
                        </ActionForm>
                      )}
                    </div>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
