import type { Metadata } from "next";
import Link from "next/link";
import { requireActor } from "@/modules/identity";
import { getSurveyInviteForActor } from "@/modules/participation";
import { t, tList } from "@/shared/copy";
import { FormularioEncuesta } from "./FormularioEncuesta";

// Encuesta anónima de una ocasión cerrada (ADR-038 regla 13): la URL del push T-191. Solo el asistente
// invitado, una vez y dentro de la ventana; las respuestas se guardan sin persona.

export const metadata: Metadata = { title: t("T-1161"), robots: { index: false } };

export default async function EncuestaPage({ params }: PageProps<"/app/encuesta/[token]">) {
  const { token } = await params;
  const actor = await requireActor(`/app/encuesta/${token}`);
  if (actor.membershipStatus === "ON_LEAVE") {
    return (
      <div className="flex flex-col gap-6">
        <h1>{t("T-1161")}</h1>
        <p>{t("T-2041")}</p>
      </div>
    );
  }
  const invite = await getSurveyInviteForActor(actor.personId, token);
  const [ratingLow, ratingHigh] = tList("T-1102") as [string, string];
  const title =
    invite.state === "NOT_FOUND" ? t("T-1161") : t("T-1095", { actividad: invite.occasionTitle });
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-display-lg">{title}</h1>
      {invite.state === "OPEN" ? (
        <>
          <p className="max-w-prose">{t("T-1096")}</p>
          <FormularioEncuesta
            token={token}
            fields={invite.fields}
            labels={{
              submit: t("T-1097"),
              required: t("T-853"),
              multiHelp: t("T-870"),
              dateHelp: t("T-871"),
              rating: [ratingLow, ratingHigh],
              thanks: t("T-1098"),
              answered: t("T-1099"),
              expired: t("T-1100"),
              notFound: t("T-1101"),
            }}
          />
        </>
      ) : (
        <p className="rounded-xl bg-oe-yellow-soft px-4 py-3 font-semibold text-oe-navy">
          {invite.state === "ANSWERED"
            ? t("T-1099")
            : invite.state === "EXPIRED"
              ? t("T-1100")
              : t("T-1101")}
        </p>
      )}
      <Link href="/app" className="boton-secundario self-start">
        {t("T-1094")}
      </Link>
    </div>
  );
}
