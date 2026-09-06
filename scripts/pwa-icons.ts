import { mkdirSync } from "node:fs";
import sharp from "sharp";

// Iconos de la PWA (ADR-038 regla 4) generados desde el isotipo (07-marca §2: uso aprobado como ícono):
// el favicon (círculo paper con la tinta navy) centrado sobre un cuadrado navy. La versión maskable
// deja el 20 % de zona segura y la insignia (badge) es la silueta monocroma de public/logos en blanco
// sobre transparente, como pide Android para la barra de estado. Corré `npm run pwa:icons`.

const ICON_SOURCE = "src/app/icon.svg";
const BADGE_SOURCE = "public/logos/isotipo.svg";
const OUT = "public/icons";
const NAVY = { r: 0, g: 31, b: 62, alpha: 1 };

async function isotipo(source: string, size: number): Promise<Buffer> {
  return sharp(source, { density: 600 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function icon(size: number, innerRatio: number, file: string): Promise<void> {
  const inner = Math.round(size * innerRatio);
  const art = await isotipo(ICON_SOURCE, inner);
  await sharp({ create: { width: size, height: size, channels: 4, background: NAVY } })
    .composite([{ input: art, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/${file}`);
}

/** Silueta monocroma: la tinta del isotipo en blanco, todo lo demás transparente. */
async function badge(size: number, file: string): Promise<void> {
  const art = await isotipo(BADGE_SOURCE, size);
  const { data, info } = await sharp(art).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] ?? 0;
    const luminance = ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0)) / 3;
    const ink = alpha > 128 && luminance < 128;
    out[i] = 255;
    out[i + 1] = 255;
    out[i + 2] = 255;
    out[i + 3] = ink ? 255 : 0;
  }
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/${file}`);
}

mkdirSync(OUT, { recursive: true });
await icon(192, 0.8, "icon-192.png");
await icon(512, 0.8, "icon-512.png");
await icon(512, 0.6, "icon-512-maskable.png");
await icon(180, 0.78, "apple-touch-icon.png");
await badge(96, "badge-96.png");
process.stdout.write(`iconos escritos en ${OUT}\n`);
