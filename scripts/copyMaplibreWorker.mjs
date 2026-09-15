// MapLibre GL JS の Worker と、Worker が読み込む共有チャンクを public/maplibre/ にコピーする
// Turbopack は MapLibre v6 が import.meta.url から求める Worker の URL を正しく解決できず、共有チャンクもハッシュ付きの名前で出力されて Worker から読み込めないため、元のファイル名のまま配信する
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "maplibre-gl", "dist");
const destination = join(root, "public", "maplibre");
const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

mkdirSync(destination, { recursive: true });
for (const file of files) {
  copyFileSync(join(source, file), join(destination, file));
}
console.log(`Copied ${files.join(", ")} to public/maplibre`);
