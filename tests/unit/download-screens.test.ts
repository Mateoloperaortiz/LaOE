import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DownloadNotice } from "@/app/admin/_kit/DownloadNotice";
import DocumentPreviewPage from "@/app/admin/documentos/[id]/page";
import RetoPage from "@/app/admin/gamificacion/retos/[id]/page";
import RevisionPage from "@/app/admin/gamificacion/revision/page";
import JuntaPage from "@/app/admin/junta/page";
import CumplimientoPage from "@/app/admin/permanencia/cumplimiento/page";
import { GET as documentPdf } from "@/app/api/documentos/[id]/pdf/route";
import { GET as personalData } from "@/app/api/mis-datos/route";
import { GET as evidenceFile } from "@/app/api/retos/evidencia/[id]/route";
import AjustesPage from "@/app/app/ajustes/page";
import { SettingsSections } from "@/app/app/ajustes/SettingsSections";
import DocumentoPage from "@/app/app/normativa/[id]/page";
import { DocumentReader } from "@/modules/content/components/DocumentReader";
import { EXPORT_ROW_LIMIT } from "@/shared/admin-kit/types";
import { t, tList } from "@/shared/copy";
import { type AnyElement, elements } from "../helpers/react-tree";

// Las pantallas que originan una descarga (ADR-113, regla 10), con sus módulos simulados y sin
// sesión en las rutas: qué enlace arman, a dónde vuelve ese enlace y si avisan al volver.

const fake = vi.hoisted(() => ({
  /** Componentes y actions que la pantalla monta pero estas pruebas no ejecutan. */
  stubs: (...names: string[]) => Object.fromEntries(names.map((name) => [name, () => null])),
  /** Las filas de Cumplimiento y las del exporte de la junta; vacías salvo en la prueba que las pone. */
  complianceRows: [] as unknown[],
  boardExportRows: [] as unknown[],
}));

vi.mock("@/env", () => ({
  getEnv: () => ({ APP_URL: "https://oe-sintetica.example", APP_TIMEZONE: "America/Bogota" }),
}));
vi.mock("next/server", () => ({ after: () => {} }));
// El lector de normativa lee la IP del request para la evidencia que agenda (ADR-123 regla 3).
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/modules/identity", () => {
  const actor = {
    personId: "persona-sintetica",
    sessionId: "sesion-sintetica",
    name: "Persona Sintética",
    email: "persona@oe-sintetica.example",
    membershipStatus: "ACTIVE",
    isAdmin: true,
    permissions: [],
  };
  return {
    // Las rutas de descarga se piden sin sesión; las pantallas, con ella.
    getActor: async () => null,
    requireActor: async () => actor,
    requireAdminActor: async () => actor,
    requireBoardActor: async () => actor,
    hasRecentStepUp: () => true,
    hasPassword: async () => true,
    listSessionsFor: async () => [],
    describeUserAgent: () => ({ browser: null, os: null }),
    getOrCreateCalendarToken: async () => "token-sintetico",
  };
});
vi.mock("@/modules/terms", () => {
  const term = { id: "terminosintetico", code: "2026-2" };
  return { getCurrentTerm: async () => term, listAllTerms: async () => [term] };
});
vi.mock("@/modules/permanence", () => ({
  COMPLIANCE_FILTERS: ["todos"],
  complianceSummary: async () => ({ computedAt: null }),
  listCompliance: async () => fake.complianceRows,
  boardExportRows: () => fake.boardExportRows,
  boardIndicators: async () => ({
    computedAt: null,
    cards: {
      active: 0,
      newcomers: 0,
      retention: null,
      enCamino: 0,
      enRiesgo: 0,
      noAlcanza: 0,
      meetingAttendance: null,
      integrations: 0,
      assemblies: 0,
    },
    retention: [],
    committees: [],
    integrations: [],
    assemblies: [],
  }),
}));
vi.mock("@/modules/participation", () => {
  const at = new Date("2026-09-01T15:00:00.000Z");
  const challenge = {
    id: "retosintetico",
    termId: "terminosintetico",
    status: "PUBLISHED",
    state: "OPEN",
    kind: "EVIDENCE",
    title: "Reto sintético",
    description: "",
    audience: "ALL",
    audienceCommitteeIds: [],
    opensAt: at,
    closesAt: at,
    basePoints: 10,
    passPercent: null,
    occasionId: null,
  };
  const row = {
    challenge,
    personName: "Persona Sintética",
    participation: {
      id: "participacionsintetica",
      status: "PENDING",
      submittedAt: at,
      evidenceText: "",
      decidedById: null,
    },
    reward: null,
    boosterKind: null,
    files: [
      {
        id: "archivosintetico",
        status: "READY",
        objectKey: "evidence/persona-sintetica/archivo.webp",
      },
      {
        id: "archivofallido",
        status: "FAILED",
        objectKey: "evidence/persona-sintetica/fallido.png",
        error: "Motivo sintético.",
      },
    ],
  };
  return {
    listPendingReviews: async () => [row],
    getChallengeAdmin: async () => ({
      challenge,
      questions: [],
      occasion: null,
      participants: [row],
    }),
    hasGrantedRewards: async () => false,
    listOccasionsForTerm: async () => [],
    loadGamificationSettings: async () => ({ defaults: {} }),
  };
});
vi.mock("@/modules/content", () => {
  const detail = {
    document: {
      id: "documentosintetico",
      title: "Documento sintético",
      kind: "STATUTE",
      version: 1,
      status: "DRAFT",
      audience: "MEMBERS",
      contentSha256: null,
    },
    articles: [],
  };
  return {
    DOCUMENT_KINDS: ["STATUTE"],
    MEDIA_LIMITS: { types: [], minBytes: 0 },
    PHOTO_MAX_BYTES: 0,
    chaptersOf: () => [],
    getMedia: async () => null,
    getDocumentWithArticles: async () => detail,
    getPublishedDocumentWithArticles: async () => detail,
    Imagen: () => null,
  };
});
vi.mock("@/modules/people", () => ({
  CONSENT_PURPOSES: [],
  SELF_MANAGED_PURPOSES: [],
  canParticipate: () => false,
  formatBirthDate: () => "",
  getPersonRecord: async () => null,
  listConsents: async () => [],
  getPeopleByIds: async () => new Map(),
  listCommitteesForSelection: async () => [],
}));
vi.mock("@/modules/comms", () => ({
  listSubscriptionsFor: async () => [],
  getPreferences: async () => ({
    pushAnnouncements: false,
    pushPoints: false,
    pushReminders: false,
    pushWordle: false,
    emailCampaigns: false,
  }),
}));
vi.mock("@/modules/system", () => ({
  getPrivacyPolicyState: async () => ({ ready: true, version: "1" }),
  requireConfig: async () => 30,
}));
vi.mock("@/modules/crm", () => ({ recordOnboardingEvidence: async () => {} }));
vi.mock("@/modules/competition", () => ({}));
vi.mock("@/modules/wallet", () => ({}));
vi.mock("@/shared/brand", () => fake.stubs("BarraTitulo", "Cartel", "Insignia"));
vi.mock("@/shared/admin-kit", () => fake.stubs("ResourcePanel"));
vi.mock("@/modules/comms/components/DeviceMark", () => fake.stubs("DeviceMark"));
vi.mock("@/modules/comms/components/NotificationsPanel", () => fake.stubs("NotificationsPanel"));
vi.mock("@/modules/identity/components/CalendarLink", () => fake.stubs("CalendarLink"));
vi.mock("@/modules/identity/components/SessionsPanel", () => fake.stubs("SessionsPanel"));
vi.mock("@/modules/people/components/PhotoUploader", () => fake.stubs("PhotoUploader"));
vi.mock("@/modules/system/components/PrivacyPolicyNotice", () => fake.stubs("PrivacyPolicyNotice"));
vi.mock("@/modules/participation/components/ChallengeCard", () => fake.stubs("ChallengeCard"));
vi.mock("@/modules/participation/components/ChallengeEditor", () => fake.stubs("ChallengeEditor"));
vi.mock("@/app/app/ajustes/PasswordForm", () => fake.stubs("PasswordForm"));
vi.mock("@/app/app/ajustes/SettingsFormBody", () => fake.stubs("SettingsFormBody"));
vi.mock("@/app/app/ajustes/SettingsForms", () => fake.stubs("ContactForm", "PreferencesForm"));
vi.mock("@/app/app/ajustes/SettingsSections", () => fake.stubs("SettingsSections"));
vi.mock("@/app/app/ajustes/actions", () =>
  fake.stubs(
    "consentAction",
    "removeDeviceAction",
    "requestDeletionAction",
    "rotateCalendarAction",
    "setPhotoAction",
  ),
);
vi.mock("@/app/admin/permanencia/cumplimiento/actions", () => fake.stubs("recomputeAction"));
vi.mock("@/app/admin/gamificacion/revision/actions", () =>
  fake.stubs("annulAction", "reviewAction"),
);
vi.mock("@/app/admin/gamificacion/retos/actions", () =>
  fake.stubs(
    "cancelChallengeAction",
    "duplicateChallengeAction",
    "publishChallengeAction",
    "saveChallengeAction",
  ),
);
vi.mock("@/app/admin/documentos/actions", () =>
  fake.stubs("loadArticlesAction", "publicationAction"),
);

const documentId = "documentosintetico";
const challengeId = "retosintetico";
const fileId = "archivosintetico";

type Search = Record<string, string>;
function props<P>(params: P, search: Search) {
  return { params: Promise.resolve(params), searchParams: Promise.resolve(search) };
}

const screens = {
  junta: (search: Search) => JuntaPage(props({}, search)),
  cumplimiento: (search: Search) => CumplimientoPage(props({}, search)),
  ajustes: (search: Search) => AjustesPage(props({}, search)),
  lectorDeMiOe: (search: Search) => DocumentoPage(props({ id: documentId }, search)),
  lectorDelAdmin: (search: Search) => DocumentPreviewPage(props({ id: documentId }, search)),
  bandeja: (search: Search) => RevisionPage(props({}, search)),
  reto: (search: Search) => RetoPage(props({ id: challengeId }, search)),
};

/** Lo que pinta la pantalla, con el aviso del admin y el lector de normativa ya resueltos. */
async function painted(render: Promise<ReactNode>): Promise<AnyElement[]> {
  const found: AnyElement[] = [];
  for (const element of elements(await render)) {
    if (element.type === DownloadNotice) {
      found.push(...elements(DownloadNotice(element.props as never)));
    } else if (element.type === DocumentReader) {
      found.push(...elements(await DocumentReader(element.props as never)));
    } else {
      found.push(element);
    }
  }
  return found;
}

function showsNotice(tree: AnyElement[]): boolean {
  return tree.some(
    (element) => element.type === "output" && element.props.children === t("T-3211"),
  );
}

/** El enlace de la pantalla a una ruta de descarga, tal como lo sigue el navegador. */
function downloadRequest(tree: AnyElement[], route: string): Request {
  const href = tree
    .map((element) => element.props.href)
    .find((value): value is string => typeof value === "string" && value.startsWith(route));
  if (!href) {
    throw new Error(`la pantalla no enlaza ${route}`);
  }
  return new Request(`http://0.0.0.0:8080${href}`);
}

/** La pantalla y la búsqueda con las que vuelve del ingreso quien pidió una descarga sin sesión. */
function comeBack(response: Response): { path: string; search: Search } {
  const location = new URL(response.headers.get("location") ?? "http://sin-redireccion.invalid");
  expect(response.status).toBe(302);
  expect(`${location.origin}${location.pathname}`).toBe("https://oe-sintetica.example/ingresar");
  const next = new URL(location.searchParams.get("next") ?? "", "http://local");
  return { path: next.pathname, search: Object.fromEntries(next.searchParams) };
}

describe("la pantalla que origina una descarga avisa cuando se vuelve a ella sin la descarga", () => {
  it.each([
    ["el panel de la junta", screens.junta],
    ["cumplimiento de permanencia", screens.cumplimiento],
    ["Ajustes", screens.ajustes],
    ["el lector de normativa de Mi OE", screens.lectorDeMiOe],
    ["el lector de normativa del admin", screens.lectorDelAdmin],
    ["la bandeja de revisión de evidencias", screens.bandeja],
    ["el detalle de un reto", screens.reto],
  ])("%s avisa que hay que pedirla otra vez, y solo con la marca que reconoce", async (_name, screen) => {
    expect(showsNotice(await painted(screen({ descarga: "1" })))).toBe(true);
    for (const search of [{}, { descarga: "" }, { descarga: "0" }, { descarga: "si" }]) {
      expect(showsNotice(await painted(screen(search)))).toBe(false);
    }
  });

  it("Ajustes abre en la sección de privacidad, donde está la descarga de Mis datos", async () => {
    const section = async (search: Search) =>
      (await painted(screens.ajustes(search))).find((element) => element.type === SettingsSections)
        ?.props.initialSection;
    expect(await section({ descarga: "1" })).toBe("privacidad");
    expect(await section({})).toBe("mis-datos");
  });
});

describe("una descarga pedida sin sesión desde su pantalla vuelve a esa pantalla, que avisa", () => {
  it("Mis datos pedido desde Ajustes vuelve a Ajustes", async () => {
    downloadRequest(await painted(screens.ajustes({})), "/api/mis-datos");
    const back = comeBack(await personalData());
    expect(back).toEqual({ path: "/app/ajustes", search: { descarga: "1" } });
    expect(showsNotice(await painted(screens.ajustes(back.search)))).toBe(true);
  });

  it("el enlace de Mis datos navega: no le pide al navegador guardar lo que la ruta responda", async () => {
    const link = (await painted(screens.ajustes({}))).find(
      (element) => element.props.href === "/api/mis-datos",
    );
    expect(link?.type).toBe("a");
    // Con `download`, el navegador guarda como archivo la página de ingreso a la que redirige la ruta
    // y la persona no llega al aviso. El nombre del archivo lo pone la ruta, que responde adjunto.
    expect(link?.props).not.toHaveProperty("download");
  });

  it.each([
    ["de Mi OE", screens.lectorDeMiOe, `/app/normativa/${documentId}`],
    ["del admin", screens.lectorDelAdmin, `/admin/documentos/${documentId}`],
  ])("el PDF pedido desde el lector %s vuelve a ese lector", async (_name, screen, path) => {
    const request = downloadRequest(await painted(screen({})), `/api/documentos/${documentId}/pdf`);
    const back = comeBack(
      await documentPdf(request, { params: Promise.resolve({ id: documentId }) }),
    );
    expect(back).toEqual({ path, search: { descarga: "1" } });
    expect(showsNotice(await painted(screen(back.search)))).toBe(true);
  });

  it("la evidencia pedida desde la bandeja de revisión vuelve a la bandeja, con su término y su filtro", async () => {
    const request = downloadRequest(
      await painted(screens.bandeja({ todas: "1" })),
      `/api/retos/evidencia/${fileId}`,
    );
    const back = comeBack(await evidenceFile(request, { params: Promise.resolve({ id: fileId }) }));
    expect(back).toEqual({
      path: "/admin/gamificacion/revision",
      search: { termId: "terminosintetico", todas: "1", descarga: "1" },
    });
    expect(showsNotice(await painted(screens.bandeja(back.search)))).toBe(true);
  });

  it("la evidencia pedida desde el detalle de un reto vuelve a ese reto", async () => {
    const request = downloadRequest(
      await painted(screens.reto({})),
      `/api/retos/evidencia/${fileId}`,
    );
    const back = comeBack(await evidenceFile(request, { params: Promise.resolve({ id: fileId }) }));
    expect(back).toEqual({
      path: `/admin/gamificacion/retos/${challengeId}`,
      search: { descarga: "1" },
    });
    expect(showsNotice(await painted(screens.reto(back.search)))).toBe(true);
  });
});

// Las mismas dos pantallas dicen por qué falló una evidencia (#124, historia 8): el motivo que el
// job dejó en la fila va junto al estado de la imagen, como en `/admin/medios`.
describe("la revisión de evidencias dice por qué no se procesó una imagen", () => {
  it.each([
    ["la bandeja de revisión", screens.bandeja],
    ["el detalle de un reto", screens.reto],
  ])("%s muestra el motivo guardado junto al estado", async (_name, screen) => {
    const texts = (await painted(screen({}))).map((element) => element.props.children);
    expect(texts).toContain(`${tList("T-2527")[1]}: Motivo sintético.`);
  });
});

// DT-250 inciso b (ADR-121 regla 12): estas dos pantallas arman su enlace de exporte por fuera del
// kit, y avisan igual que el listado del kit cuando el CSV va a salir recortado.
describe("aviso de exporte recortado en las pantallas que arman su enlace", () => {
  const over = EXPORT_ROW_LIMIT + 1;
  const pageProps = { params: Promise.resolve({}), searchParams: Promise.resolve({}) };

  function complianceRow(index: number) {
    return {
      id: `fila-${index}`,
      personId: `persona-${index}`,
      personName: `Persona ${index}`,
      status: "ACTIVE",
      condition: null,
      committeeName: "",
      generalTotal: 0,
      committeeTotal: 0,
      total: 0,
      threshold: 0,
      state: null,
      mandatoryAttended: 0,
      mandatoryTotal: 0,
    };
  }

  /** Lo que dicen los avisos que la pantalla pinta. */
  function notices(page: ReactNode): unknown[] {
    return elements(page)
      .filter((element) => element.type === "output")
      .map((element) => element.props.children);
  }

  afterEach(() => {
    fake.complianceRows = [];
    fake.boardExportRows = [];
  });

  it("Cumplimiento avisa cuando su lista pasa del tope, y no cuando cabe entera", async () => {
    fake.complianceRows = Array.from({ length: over }, (_, index) => complianceRow(index));
    expect(notices(await CumplimientoPage(pageProps))).toContain(
      t("T-3249", { n: EXPORT_ROW_LIMIT, total: over }),
    );
    fake.complianceRows = fake.complianceRows.slice(1);
    expect(notices(await CumplimientoPage(pageProps))).toEqual([]);
  });

  it("la junta avisa cuando las filas de su exporte pasan del tope, y no cuando caben", async () => {
    fake.boardExportRows = Array.from({ length: over }, () => ({}));
    expect(notices(await JuntaPage(pageProps))).toContain(
      t("T-3249", { n: EXPORT_ROW_LIMIT, total: over }),
    );
    fake.boardExportRows = fake.boardExportRows.slice(1);
    expect(notices(await JuntaPage(pageProps))).toEqual([]);
  });
});
