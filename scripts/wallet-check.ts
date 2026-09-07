import { spawnSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Env, parseEnv } from "../src/env";

// Auditoría local: no importa DB, dominio ni transportes. --fixtures usa solo suites unitarias.
const root = fileURLToPath(new URL("../", import.meta.url));
const appleKeys = [
  "APPLE_PASS_TYPE_ID",
  "APPLE_TEAM_ID",
  "APPLE_PASS_CERT_BASE64",
  "APPLE_PASS_KEY_BASE64",
  "APPLE_PASS_KEY_PASSPHRASE",
] as const;
const googleKeys = [
  "GOOGLE_WALLET_ISSUER_ID",
  "GOOGLE_WALLET_SA_EMAIL",
  "GOOGLE_WALLET_SA_KEY_BASE64",
  "GOOGLE_WALLET_CLASS_SUFFIX",
] as const;
const g4Fingerprint = "EA4757885538DD8CB59FF4556F676087D83C85E70902C122E42C0808B5BCE14C";
let failures = 0;

function report(level: "OK" | "ERROR" | "AVISO" | "PENDIENTE", message: string): void {
  if (level === "ERROR") failures++;
  process.stdout.write(`${level} · ${message}\n`);
}

// Reutiliza el parser de producción sin exigir ni leer secretos de DB, correo o almacenamiento.
// Estos valores solo completan campos ajenos a Wallet; nunca se conectan a ningún servicio.
function walletEnv(keys: readonly string[]): Env {
  return parseEnv({
    APP_URL: "http://localhost:3000",
    DATABASE_URL: "postgresql://unused:unused@127.0.0.1/unused",
    SESSION_SECRET: "wallet-check-local-validation-only",
    INSTITUTIONAL_EMAIL_DOMAINS: "example.test",
    EMAIL_FROM: "wallet@example.test",
    S3_ENDPOINT: "http://127.0.0.1:3900",
    S3_BUCKET: "unused",
    S3_ACCESS_KEY_ID: "unused",
    S3_SECRET_ACCESS_KEY: "unused",
    ...Object.fromEntries(keys.map((key) => [key, process.env[key]])),
  });
}

function checkValidity(certificate: X509Certificate, label: string): void {
  const now = Date.now();
  const start = Date.parse(certificate.validFrom);
  const end = Date.parse(certificate.validTo);
  if (!Number.isFinite(start) || !Number.isFinite(end) || now < start || now >= end) {
    report("ERROR", `${label}: certificado fuera de vigencia.`);
  } else {
    report("OK", `${label}: vigente hasta ${new Date(end).toISOString().slice(0, 10)} UTC.`);
    if (end - now < 30 * 86_400_000) report("AVISO", `${label}: renovar antes de 30 días.`);
  }
}

function checkG4(): X509Certificate | undefined {
  try {
    const certificate = new X509Certificate(
      readFileSync(join(root, "src/shared/adapters/certs/AppleWWDRCAG4.crt")),
    );
    if (certificate.fingerprint256.replaceAll(":", "") !== g4Fingerprint) {
      report("ERROR", "WWDR G4: el fingerprint no coincide con el certificado Apple versionado.");
      return;
    }
    checkValidity(certificate, "WWDR G4");
    return certificate;
  } catch {
    report("ERROR", "WWDR G4: archivo ausente o certificado ilegible.");
  }
}

function checkAssets(): void {
  const pngs: [string, number, number][] = [["public/wallet/google-logo.png", 1024, 1024]];
  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? "" : `@${scale}x`;
    for (const [name, size] of [
      ["icon", 29],
      ["logo", 50],
    ] as const) {
      pngs.push([`src/modules/wallet/assets/${name}${suffix}.png`, size * scale, size * scale]);
    }
  }
  const before = failures;
  for (const [path, width, height] of pngs) {
    try {
      const data = readFileSync(join(root, path));
      if (
        !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        data.toString("ascii", 12, 16) !== "IHDR" ||
        data.readUInt32BE(16) !== width ||
        data.readUInt32BE(20) !== height
      )
        throw new Error("PNG inválido");
    } catch {
      report("ERROR", `${path}: falta un PNG de ${width} × ${height}.`);
    }
  }
  for (const name of ["apple-wallet-badge.svg", "google-wallet-badge.svg"]) {
    try {
      if (!/<svg\b/.test(readFileSync(join(root, "public/wallet", name), "utf8"))) {
        throw new Error("SVG inválido");
      }
    } catch {
      report("ERROR", `public/wallet/${name}: falta el badge SVG.`);
    }
  }
  if (failures === before)
    report("OK", "7 PNG con dimensiones esperadas y 2 badges SVG presentes.");
  report("PENDIENTE", "Aspecto, recorte y legibilidad de estos artes en dispositivos reales.");
}

function checkConfig(g4: X509Certificate | undefined): void {
  const appleOn = appleKeys.some((key) => Boolean(process.env[key]));
  const googleOn = googleKeys.slice(0, 3).some((key) => Boolean(process.env[key]));
  for (const [label, keys, enabled] of [
    ["Apple Wallet", appleKeys, appleOn],
    ["Google Wallet", googleKeys, googleOn],
  ] as const) {
    try {
      const env = walletEnv(keys);
      report(
        "OK",
        `${label}: ${enabled ? "configuración completa y PEM/IDs válidos" : "apagado"}.`,
      );
      if (label === "Apple Wallet" && env.APPLE_PASS_CERT_BASE64) {
        const certificate = new X509Certificate(Buffer.from(env.APPLE_PASS_CERT_BASE64, "base64"));
        checkValidity(certificate, "Pass Type ID");
        const subject = certificate.subject.split("\n");
        if (
          !subject.includes(`UID=${env.APPLE_PASS_TYPE_ID}`) ||
          !subject.includes(`OU=${env.APPLE_TEAM_ID}`)
        ) {
          report("ERROR", "Apple: UID/OU del certificado no corresponden al Pass Type ID/Team ID.");
        } else report("OK", "Apple: el certificado corresponde a los IDs configurados.");
        if (!g4 || !certificate.checkIssued(g4) || !certificate.verify(g4.publicKey)) {
          report(
            "ERROR",
            "Apple: el certificado de firma no está firmado por el WWDR G4 esperado.",
          );
        } else report("OK", "Apple: firma del certificado comprobada contra WWDR G4.");
      }
    } catch {
      // No imprimir errores del parser/OpenSSL ni sus valores de entrada.
      const missing = keys.filter(
        (key) => !key.endsWith("PASSPHRASE") && !key.endsWith("CLASS_SUFFIX") && !process.env[key],
      );
      report(
        "ERROR",
        `${label}: configuración inválida; ${
          enabled && missing.length
            ? `faltan ${missing.join(", ")}`
            : "revisar formato de IDs/sufijo, base64 PEM, tipo RSA y coincidencia de clave/certificado"
        }.`,
      );
    }
  }
  if (appleOn || googleOn) {
    try {
      const appUrl = new URL(process.env.APP_URL ?? "");
      if (
        !["https:", "http:"].includes(appUrl.protocol) ||
        appUrl.username ||
        appUrl.password ||
        appUrl.search ||
        appUrl.hash
      )
        throw new Error("APP_URL inválida");
      report(
        appUrl.protocol === "https:" ? "OK" : "AVISO",
        appUrl.protocol === "https:"
          ? "APP_URL usa HTTPS; alcance público del logo y origen por comprobar."
          : "APP_URL usa HTTP: solo comprobación local; activación real exige HTTPS y logo público.",
      );
    } catch {
      report("ERROR", "APP_URL: definir una URL HTTP(S) sin credenciales, query ni fragmento.");
    }
  }
  if (googleOn && process.env.JOBS_ENABLED !== "true") {
    report("AVISO", "JOBS_ENABLED no está activo: comprobar el worker antes de habilitar Google.");
  }
  report(
    "PENDIENTE",
    "Activación real: cuenta Apple, permisos del emisor Google y publicación no verificados.",
  );
}

function sanitizeLog(value: string): string {
  return value
    .replace(/-----BEGIN [\s\S]*?-----END [^-]+-----/g, "[PEM omitido]")
    .replace(/\boe2\.[A-Za-z0-9._-]+/g, "[QR omitido]")
    .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[JWT omitido]")
    .replace(/[A-Za-z0-9+/_-]{80,}={0,2}/g, "[material codificado omitido]");
}

function runFixtures(): void {
  const result = spawnSync(
    process.execPath,
    [
      join(root, "node_modules/vitest/vitest.mjs"),
      "run",
      "--project",
      "unit",
      "--reporter=json",
      "tests/unit/env.test.ts",
      "tests/unit/wallet-adapters.test.ts",
      "tests/unit/wallet-pure.test.ts",
    ],
    {
      cwd: root,
      // Lista permitida: ni credenciales, ni DB, ni NODE_OPTIONS heredados. No usa npm install.
      env: {
        PATH: process.env.PATH,
        TMPDIR: process.env.TMPDIR,
        NODE_ENV: "test",
        TZ: "UTC",
        CI: "true",
      },
      encoding: "utf8",
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  let passed = 0;
  try {
    const summary = JSON.parse(result.stdout || "{}");
    if (Number.isInteger(summary.numPassedTests)) passed = summary.numPassedTests;
  } catch {
    // El diagnóstico completo se guarda sanitizado si el runner no emitió JSON válido.
  }
  if (result.status === 0 && passed > 0) {
    report("OK", `${passed} pruebas unitarias con fixtures: firma CMS/RS256, contratos y env.`);
  } else {
    const log = join(mkdtempSync(join(tmpdir(), "wallet-check-")), "fixtures.log");
    const runnerStatus = `Runner: exit=${result.status}, signal=${result.signal}, error=${result.error ? "no se completó; revisar instalación o límite de 60 segundos" : "ninguno"}`;
    writeFileSync(
      log,
      sanitizeLog(`${runnerStatus}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`),
      { mode: 0o600 },
    );
    report("ERROR", `Fixtures incompletos o fallidos; diagnóstico sanitizado: ${log}`);
  }
  report(
    "PENDIENTE",
    "Los fixtures no prueban confianza Apple, Google real, DB, outbox, rutas ni PWA.",
  );
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && !["--fixtures", "--help"].includes(args[0]))) {
    report("ERROR", "Uso: npm run wallet:check [-- --fixtures | -- --help]");
    return;
  }
  if (args[0] === "--help") {
    process.stdout.write(
      "npm run wallet:check: audita configuración Wallet y archivos locales, sin red ni DB.\n" +
        "npm run wallet:check -- --fixtures: ignora credenciales del entorno y ejecuta suites unitarias de juguete.\n" +
        "Salida 0: comprobaciones solicitadas pasan; no significa activación real. Salida 1: corregir errores.\n",
    );
    return;
  }
  process.stdout.write(
    "Comprobación local de Wallet · no contacta Google, Apple ni bases de datos.\n",
  );
  const g4 = checkG4();
  checkAssets();
  if (args[0] === "--fixtures") runFixtures();
  else {
    checkConfig(g4);
    report(
      "PENDIENTE",
      "Pruebas de software no ejecutadas; usar npm run wallet:check -- --fixtures.",
    );
  }
  report(
    "PENDIENTE",
    "Runbook F8 en 10-verificacion: integración/outbox y alta/actualización/revocación.",
  );
  report(
    "PENDIENTE",
    "iPhone Safari/PWA y Android Chrome/PWA: agregar pase, mostrarlo offline y escanear con anfitrión online.",
  );
  report(
    "PENDIENTE",
    "Rotar QR y dar de baja: comprobar rechazo del anterior, Google actualizado y reemplazo manual Apple.",
  );
  process.stdout.write(
    `Resultado local: ${failures ? `${failures} error(es)` : "sin errores"}; activación real NO verificada.\n`,
  );
}

try {
  main();
} catch {
  report(
    "ERROR",
    "La comprobación local no pudo completarse; revisar permisos y dependencias instaladas.",
  );
}
process.exitCode = failures ? 1 : 0;
