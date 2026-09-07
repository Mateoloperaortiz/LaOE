import { mkdir } from "node:fs/promises";
import sharp from "sharp";

// ADR-040 y 07-marca: silueta paper del isotipo; se conserva el arte original.
const privateDir = "src/modules/wallet/assets";
const publicDir = "public/wallet";
const source = "public/logos/isotipo.svg";

async function mark(size: number): Promise<Buffer> {
  const { data, info } = await sharp(source, { density: 600 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const ink = ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0)) / 3 < 128;
    data[i] = 246;
    data[i + 1] = 246;
    data[i + 2] = 246;
    if (!ink) data[i + 3] = 0;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

await mkdir(privateDir, { recursive: true });
await mkdir(publicDir, { recursive: true });
for (const scale of [1, 2, 3]) {
  const suffix = scale === 1 ? "" : `@${scale}x`;
  for (const [name, base] of [
    ["icon", 29],
    ["logo", 50],
  ] as const) {
    await sharp(await mark(base * scale))
      .png()
      .toFile(`${privateDir}/${name}${suffix}.png`);
  }
}
const size = 1024;
await sharp({ create: { width: size, height: size, channels: 4, background: "#001F3E" } })
  .composite([{ input: await mark(Math.round(size * 0.7)), gravity: "centre" }])
  .png()
  .toFile(`${publicDir}/google-logo.png`);
process.stdout.write("Assets de billeteras generados desde el isotipo.\n");
