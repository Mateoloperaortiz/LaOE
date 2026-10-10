import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { single } from "@/app/_lib/search";
import { requireActor } from "@/modules/identity";
import {
  BOOSTER_KINDS,
  type BoosterKind,
  type BoosterView,
  type CheckInRow,
  findCheckIn,
  getOccasion,
  getOccasionByPublicId,
  isPublicId,
  isVoluntaryOccasion,
  listBoostersFor,
  loadGamificationSettings,
  type OccasionRow,
  windowState,
} from "@/modules/participation";
import { getMembershipRef } from "@/modules/people";
import { resolveAlias } from "@/modules/system";
import { getTerm } from "@/modules/terms";
import { Cartel, Elemento, LogoOE, SelloOE } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDate, formatDateRange, formatTime } from "@/shared/lib/dates";
import { type CheckInResultCode, checkInAction } from "./actions";

// Check-in por QR (ADR-006, ADR-035 regla 5): con sesión (el proxy redirige sin cookie), un solo botón
// cálido, el código rotativo si la ocasión lo exige y los estados de T-092 a T-100 y T-523 a T-534.

export const metadata: Metadata = { title: t("T-558"), robots: { index: false } };

type Params = { publicId: string };

const RESULT_CODES: readonly CheckInResultCode[] = [
  "puntos",
  "registrado",
  "pendiente",
  "repetido",
  "codigo",
  "falta-codigo",
  "cerrado",
  "no-abre",
  "nuevos",
  "inactivo",
  "sin-semestre",
  "no-existe",
  "booster",
];

type View =
  | { kind: "message"; text: string; success?: boolean; points?: number }
  | { kind: "form"; needsCode: boolean; codeError: string | null; boosterError: string | null };

function existingView(existing: CheckInRow): View {
  switch (existing.status) {
    case "PENDING":
      return { kind: "message", text: t("T-094") };
    case "REJECTED":
      return { kind: "message", text: t("T-532") };
    case "CANCELLED":
      return { kind: "message", text: t("T-533", { motivo: existing.reason ?? "—" }) };
    default:
      return { kind: "message", text: t("T-095") };
  }
}

/**
 * El `r` de la dirección elige el texto de una asistencia que existe y que dice lo mismo (ADR-120
 * regla 6). La action redirige con él recién escrita la fila, pero cualquiera con sesión lo puede
 * escribir a mano: sin asistencia, o con una en otro estado, no pinta nada y decide la fila.
 */
function resultView(
  result: CheckInResultCode,
  existing: CheckInRow | null,
  points: number,
): View | null {
  switch (result) {
    case "puntos":
      if (existing?.status !== "APPROVED") return null;
      // El sello de marca ya dice "¡OE OE OE!": el texto no lo repite.
      return {
        kind: "message",
        text: t("T-092", { n: points }).replace(/\s*¡OE OE OE!$/, ""),
        success: true,
        points,
      };
    case "registrado":
      if (existing?.status !== "APPROVED") return null;
      return { kind: "message", text: t("T-093"), success: true };
    case "pendiente":
      if (existing?.status !== "PENDING") return null;
      return { kind: "message", text: t("T-094"), success: true };
    default:
      return null;
  }
}

/** Los resultados que anuncian un registro: valen solo con la fila que los respalda. */
const SUCCESS_CODES: readonly CheckInResultCode[] = ["puntos", "registrado", "pendiente"];

function occasionView(
  row: OccasionRow,
  termClosed: boolean,
  isNew: boolean,
  now: Date,
  result: CheckInResultCode | null,
): View {
  if (row.status === "DRAFT") return { kind: "message", text: t("T-526") };
  if (row.status === "CANCELLED") return { kind: "message", text: t("T-524") };
  if (row.status === "CLOSED") return { kind: "message", text: t("T-096") };
  if (termClosed) return { kind: "message", text: t("T-525") };
  const window = windowState(row, now);
  if (window === "NOT_OPEN") {
    return {
      kind: "message",
      text: t("T-097", {
        fecha: formatDate(row.checkInOpensAt),
        hora: formatTime(row.checkInOpensAt),
      }),
    };
  }
  if (window === "CLOSED") return { kind: "message", text: t("T-096") };
  if (row.newMembersOnly && !isNew) return { kind: "message", text: t("T-523") };
  if (result === "inactivo") return { kind: "message", text: t("T-673", { nombre: "" }).trim() };
  return {
    kind: "form",
    needsCode: row.requireRotatingCode,
    codeError: result === "codigo" ? t("T-099") : result === "falta-codigo" ? t("T-098") : null,
    boosterError: null,
  };
}

export default async function CheckInPage({ params, searchParams }: PageProps<"/a/[publicId]">) {
  const { publicId } = (await params) as Params;
  const search = await searchParams;
  const code = single(search.c);
  const resultParam = single(search.r);
  const claimed = RESULT_CODES.includes(resultParam as CheckInResultCode)
    ? (resultParam as CheckInResultCode)
    : null;
  const actor = await requireActor(`/a/${publicId}${code ? `?c=${encodeURIComponent(code)}` : ""}`);
  const [inicio] = tList("T-038");
  const [cuando, donde, puntosLabel] = tList("T-528");

  const row = isPublicId(publicId) ? await getOccasionByPublicId(publicId) : null;
  if (!row) {
    // Un QR impreso con un publicId retirado sigue resolviendo por el alias legado (ADR-035 regla 3).
    const alias = isPublicId(publicId) ? await resolveAlias(`/a/${publicId}`) : null;
    const target = alias ? await getOccasion(alias.targetId) : null;
    if (target) {
      redirect(`/a/${target.publicId}${code ? `?c=${encodeURIComponent(code)}` : ""}`);
    }
    return (
      <main className="mx-auto flex max-w-2xl flex-1 flex-col items-start justify-center gap-6 px-4 py-16">
        <Elemento tipo="destello" className="size-16 text-oe-orange" />
        <h1 className="text-display-lg">{t("T-558")}</h1>
        <p className="text-lg">{t("T-527")}</p>
        <Link href="/app" className="boton-primario">
          {t("T-004")}
        </Link>
      </main>
    );
  }

  const [existing, membership, term] = await Promise.all([
    findCheckIn(row.id, actor.personId),
    getMembershipRef(actor.personId),
    getTerm(row.termId),
  ]);
  const now = new Date();
  const fresh = claimed ? resultView(claimed, existing, row.points) : null;
  // Un resultado de éxito que la fila no respalda no cuenta para nada de lo que sigue.
  const result = claimed && SUCCESS_CODES.includes(claimed) && !fresh ? null : claimed;
  const view: View =
    fresh ??
    (existing
      ? existingView(existing)
      : occasionView(
          row,
          term?.pointsClosedAt !== null && term?.pointsClosedAt !== undefined,
          membership?.firstTermId === row.termId,
          now,
          result,
        ));
  if (view.kind === "form" && result === "booster") {
    view.boosterError = single(search.m) || (tList("T-2466")[3] ?? "");
  }

  // Selector de booster (ADR-067 regla 8): solo en ocasiones voluntarias con puntos y con la
  // gamificación activa; el `b` del redirect resuelve el nombre para el aviso de aplicado.
  const boosterEligible =
    isVoluntaryOccasion(row) && row.points > 0 && (await loadGamificationSettings()).enabled;
  const appliedBoosterId = result && result !== "booster" ? single(search.b) : "";
  const boosters: BoosterView[] =
    boosterEligible && (view.kind === "form" || appliedBoosterId)
      ? await listBoostersFor(actor.personId)
      : [];
  const selectable = boosters.filter((item) => item.state === "AVAILABLE");
  const targeted = selectable.find(
    (item) => item.target?.kind === "OCCASION" && item.target.id === row.id,
  );
  const applied = boosters.find(
    (item) =>
      item.id === appliedBoosterId && item.target?.kind === "OCCASION" && item.target.id === row.id,
  );
  const boosterNames = tList("T-2451");
  const boosterName = (kind: BoosterKind) => boosterNames[BOOSTER_KINDS.indexOf(kind)] ?? kind;
  const selectorLabels = tList("T-2578");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10">
      <Link href="/app" className="self-start text-titulo" aria-label={inicio}>
        <LogoOE height={72} />
      </Link>
      <Cartel
        variante="navy"
        nivel="h1"
        tamano="hero"
        eyebrow={t("T-534")}
        titulo={t("T-090", { "nombre de la actividad": row.title })}
      >
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-base">
          <div className="flex gap-2">
            <dt className="shrink-0 font-semibold">{cuando}</dt>
            <dd>{formatDateRange(row.startsAt, row.endsAt)}</dd>
          </div>
          {row.location ? (
            <div className="flex gap-2">
              <dt className="shrink-0 font-semibold">{donde}</dt>
              <dd>{row.location}</dd>
            </div>
          ) : null}
          <div className="flex gap-2">
            <dt className="shrink-0 font-semibold">{puntosLabel}</dt>
            <dd>{row.points > 0 ? t("T-529", { n: row.points }) : t("T-530")}</dd>
          </div>
        </dl>
        <div className="mt-8 flex flex-col items-start gap-4" aria-live="polite">
          {actor.membershipStatus === "ON_LEAVE" ? (
            <p className="max-w-prose text-xl font-semibold">{t("T-2041")}</p>
          ) : view.kind === "message" ? (
            <>
              <p className="max-w-prose text-xl font-semibold" data-resultado={result ?? "estado"}>
                {view.text}
              </p>
              {applied ? (
                <p className="text-base font-semibold">
                  {t("T-2462", { booster: boosterName(applied.kind) })}
                </p>
              ) : null}
              {view.success && view.points ? <SelloOE tamano="lg" /> : null}
              {view.success ? (
                <Link href="/app/gh-points" className="boton-secundario">
                  {t("T-531")}
                </Link>
              ) : (
                <Link href="/app" className="boton-secundario">
                  {t("T-004")}
                </Link>
              )}
            </>
          ) : (
            <form action={checkInAction} className="flex w-full max-w-sm flex-col gap-4">
              <input type="hidden" name="publicId" value={row.publicId} />
              {view.needsCode ? (
                <label className="flex flex-col gap-1 text-base font-semibold">
                  <span>{t("T-098")}</span>
                  <input
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    defaultValue={code}
                    aria-invalid={view.codeError ? true : undefined}
                    aria-describedby={view.codeError ? "codigo-error" : undefined}
                    className="rounded-xl border border-borde bg-white px-4 py-3 text-2xl tracking-[0.3em] text-oe-navy"
                  />
                  {view.codeError ? (
                    <span id="codigo-error" className="text-sm font-normal">
                      {view.codeError}
                    </span>
                  ) : null}
                </label>
              ) : null}
              {selectable.length > 0 ? (
                <label className="flex flex-col gap-1 text-base font-semibold">
                  <span>{t("T-2452")}</span>
                  <select
                    name="boosterId"
                    defaultValue={targeted?.id ?? ""}
                    aria-describedby={view.boosterError ? "booster-error" : undefined}
                    className="rounded-xl border border-borde bg-white px-4 py-3 text-oe-navy"
                  >
                    <option value="">{selectorLabels[0]}</option>
                    {selectable.map((item) => (
                      <option key={item.id} value={item.id}>
                        {(selectorLabels[1] ?? "")
                          .replace("{booster}", boosterName(item.kind))
                          .replace("{fecha}", formatDate(item.expiresAt))}
                      </option>
                    ))}
                  </select>
                  {targeted ? (
                    <span className="text-sm font-normal">
                      {t("T-2462", { booster: boosterName(targeted.kind) })}
                    </span>
                  ) : null}
                  {view.boosterError ? (
                    <span id="booster-error" role="alert" className="text-sm font-normal">
                      {view.boosterError}
                    </span>
                  ) : null}
                </label>
              ) : null}
              <button type="submit" className="boton-calido self-start">
                {t("T-091")}
              </button>
            </form>
          )}
        </div>
      </Cartel>
    </main>
  );
}
