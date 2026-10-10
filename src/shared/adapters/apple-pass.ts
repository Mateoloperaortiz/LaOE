import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PKPass } from "passkit-generator";
import { getEnv } from "@/env";
import { WalletError } from "./wallet-error";

export interface ApplePassCertificates {
  wwdr: string | Buffer;
  signerCert: string | Buffer;
  signerKey: string | Buffer;
  signerKeyPassphrase?: string;
}

export interface ApplePassInput {
  /** Imágenes y localizaciones. `props` proporciona el pass.json completo. */
  files: Record<string, Buffer>;
  props: Record<string, unknown>;
}

let wwdr: Promise<Buffer> | undefined;

export function isApplePassConfigured(): boolean {
  const env = getEnv();
  return Boolean(
    env.APPLE_PASS_TYPE_ID &&
      env.APPLE_TEAM_ID &&
      env.APPLE_PASS_CERT_BASE64 &&
      env.APPLE_PASS_KEY_BASE64,
  );
}

/** Firma bytes; la autorización, el contenido y el registro de emisión pertenecen a wallet. */
export async function signPass(
  input: ApplePassInput,
  certificatesOverride?: ApplePassCertificates,
): Promise<Buffer> {
  let certificates = certificatesOverride;
  if (!certificates) {
    const env = getEnv();
    if (!isApplePassConfigured() || !env.APPLE_PASS_CERT_BASE64 || !env.APPLE_PASS_KEY_BASE64) {
      throw new WalletError("NOT_CONFIGURED", "Apple Wallet sin configurar");
    }
    wwdr ??= readFile(join(process.cwd(), "src/shared/adapters/certs/AppleWWDRCAG4.crt"));
    certificates = {
      wwdr: await wwdr,
      signerCert: Buffer.from(env.APPLE_PASS_CERT_BASE64, "base64"),
      signerKey: Buffer.from(env.APPLE_PASS_KEY_BASE64, "base64"),
      ...(env.APPLE_PASS_KEY_PASSPHRASE
        ? { signerKeyPassphrase: env.APPLE_PASS_KEY_PASSPHRASE }
        : {}),
    };
  }
  try {
    const pass = new PKPass(
      {
        ...input.files,
        "pass.json": Buffer.from(JSON.stringify(input.props)),
      },
      certificates,
    );
    return pass.getAsBuffer();
  } catch {
    // Los errores del proveedor podrían contener valores del pase o de las credenciales.
    throw new WalletError("SIGNING_FAILED", "No se pudo firmar el pase de Apple Wallet");
  }
}
