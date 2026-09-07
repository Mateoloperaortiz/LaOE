import { t } from "@/shared/copy";

// ADR-040: representación mínima y pura, compartida por las dos billeteras.
export interface CarnetData {
  personId: string;
  fullName: string;
  committees: { name: string; role: string }[];
  term: { id: string; code: string } | null;
  firstTermCode: string | null;
  token: string;
  walletEpoch: number;
  revision: number;
}

export interface PassSnapshot {
  walletEpoch: number;
  tokenRevision: number;
  renderedTermId: string | null;
}

function committeeText(data: CarnetData): string {
  return data.committees.length
    ? data.committees.map((item) => t("T-370", { cargo: item.role, comité: item.name })).join("\n")
    : t("T-402");
}

function localized(value: string) {
  return { defaultValue: { language: "es-CO", value } };
}

export function buildApplePassJson(
  data: CarnetData,
  config: { passTypeIdentifier: string; teamIdentifier: string; appUrl: string },
) {
  return {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeIdentifier,
    teamIdentifier: config.teamIdentifier,
    serialNumber: data.personId,
    organizationName: t("T-1197"),
    description: t("T-1198"),
    logoText: t("T-1197"),
    sharingProhibited: true,
    backgroundColor: "rgb(0, 31, 62)",
    foregroundColor: "rgb(246, 246, 246)",
    labelColor: "rgb(255, 216, 75)",
    barcodes: [{ format: "PKBarcodeFormatQR", message: data.token, messageEncoding: "iso-8859-1" }],
    generic: {
      headerFields: data.term ? [{ key: "term", label: t("T-1199"), value: data.term.code }] : [],
      primaryFields: [{ key: "member", label: t("T-1200"), value: data.fullName }],
      secondaryFields: data.committees.length
        ? data.committees.slice(0, 3).map((item, index) => ({
            key: `committee-${index}`,
            label: item.role,
            value: item.name,
          }))
        : [{ key: "committees-empty", label: t("T-1201"), value: t("T-402") }],
      auxiliaryFields: data.firstTermCode
        ? [{ key: "since", label: t("T-1202"), value: data.firstTermCode }]
        : [],
      backFields: [
        { key: "instructions", label: t("T-1198"), value: t("T-1203") },
        { key: "update", label: t("T-1189"), value: t("T-1205") },
        { key: "my-oe", label: t("T-1204"), value: new URL("/app/carnet", config.appUrl).href },
        { key: "committees", label: t("T-1201"), value: committeeText(data) },
      ],
    },
  };
}

export function googleIdentifiers(issuerId: string, classSuffix: string, personId: string) {
  const classId = `${issuerId}.${classSuffix}`;
  return { classId, id: `${classId}.${personId}` };
}

export function buildGoogleClass(classId: string) {
  return { id: classId, multipleDevicesAndHoldersAllowedStatus: "ONE_USER_ALL_DEVICES" };
}

export function buildGoogleObject(
  data: CarnetData,
  config: { id: string; classId: string; appUrl: string },
) {
  const appUrl = new URL(config.appUrl);
  return {
    id: config.id,
    classId: config.classId,
    state: "ACTIVE",
    cardTitle: localized(t("T-1197")),
    header: localized(data.fullName),
    ...(data.term ? { subheader: localized(data.term.code) } : {}),
    hexBackgroundColor: "#001F3E",
    ...(appUrl.protocol === "https:"
      ? {
          logo: {
            sourceUri: { uri: new URL("/wallet/google-logo.png", appUrl).href },
            contentDescription: localized(t("T-1197")),
          },
        }
      : {}),
    barcode: {
      type: "QR_CODE",
      value: data.token,
      alternateText: data.term ? t("T-1206", { semestre: data.term.code }) : t("T-1198"),
    },
    textModulesData: [
      { id: "committees", header: t("T-1201"), body: committeeText(data) },
      ...(data.firstTermCode
        ? [{ id: "since", header: t("T-1202"), body: data.firstTermCode }]
        : []),
    ],
    linksModuleData: {
      uris: [{ id: "my-oe", uri: new URL("/app/carnet", appUrl).href, description: t("T-1204") }],
    },
  };
}

/** PUT omite todos los datos personales y el QR; conserva los campos obligatorios. */
export function buildGoogleTombstone(id: string, classId: string) {
  return {
    id,
    classId,
    state: "EXPIRED",
    cardTitle: localized(t("T-1197")),
    header: localized(t("T-223")),
  };
}

export function buildSaveClaims(
  config: { serviceAccountEmail: string; appUrl: string; id: string; classId: string },
  now = new Date(),
) {
  return {
    iss: config.serviceAccountEmail,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(now.getTime() / 1000),
    origins: [new URL(config.appUrl).origin],
    payload: { genericObjects: [{ id: config.id, classId: config.classId }] },
  };
}

export function isStalePass(
  pass: PassSnapshot,
  credential: { walletEpoch: number; revision: number } | null,
  currentTermId: string | null,
): boolean {
  return (
    !credential ||
    pass.walletEpoch !== credential.walletEpoch ||
    pass.tokenRevision !== credential.revision ||
    pass.renderedTermId !== currentTermId
  );
}
