import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "assets", "vertia-icon.png");
const BACKGROUND = "#ffffff";

const glyph = await sharp(source).trim().png().toBuffer();

// size: 出力の一辺、glyphRatio: 一辺に対する図形の大きさ、cornerRatio: 背景の角丸
async function renderIcon({ size, glyphRatio, cornerRatio }) {
  const glyphSize = Math.round(size * glyphRatio);
  const resizedGlyph = await sharp(glyph)
    .resize(glyphSize, glyphSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const radius = Math.round(size * cornerRatio);
  const background = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${BACKGROUND}"/></svg>`,
  );
  return sharp(background)
    .composite([{ input: resizedGlyph, gravity: "center" }])
    .png()
    .toBuffer();
}

function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

function write(relativePath, data) {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  console.log(`${relativePath} (${data.length} bytes)`);
}

const faviconSizes = [16, 32, 48];
const favicons = await Promise.all(
  faviconSizes.map(async (size) => ({ size, data: await renderIcon({ size, glyphRatio: 0.8, cornerRatio: 0.22 }) })),
);
write("app/favicon.ico", buildIco(favicons));
write("app/icon.png", await renderIcon({ size: 192, glyphRatio: 0.78, cornerRatio: 0.22 }));

write("app/apple-icon.png", await renderIcon({ size: 180, glyphRatio: 0.7, cornerRatio: 0 }));

write("public/icons/icon-192.png", await renderIcon({ size: 192, glyphRatio: 0.7, cornerRatio: 0 }));
write("public/icons/icon-512.png", await renderIcon({ size: 512, glyphRatio: 0.7, cornerRatio: 0 }));
write("public/icons/icon-maskable-512.png", await renderIcon({ size: 512, glyphRatio: 0.55, cornerRatio: 0 }));
