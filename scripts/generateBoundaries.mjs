// 国土数値情報の行政区域データ (N03) から、マップ画面で使う市区町村と都道府県の境界を public/boundaries/ に生成する
// N03 の全国データ (シェープファイル) を https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2025.html から取得し、.shp のパスを渡す
// N03 に英語名がないため、日本郵便の郵便番号データ (ローマ字) の KEN_ALL_ROME.CSV のパスも渡す
// https://www.post.japanpost.jp/service/search/zipcode/download/roman-zip.html
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cellToLatLng, polygonToCells } from "h3-js";
import mapshaper from "mapshaper";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const destination = join(root, "public", "boundaries");

// 市区町村はズーム 9 以上、都道府県は 6〜9 で表示するため、それぞれの縮尺で目立たない程度に間引く
const MUNICIPALITY_SIMPLIFY_M = 50;
const PREFECTURE_SIMPLIFY_M = 300;
// 解像度 8 のセル (約 0.74km²) より十分小さい島は、探索率にも外枠の見た目にも影響しない
const MIN_ISLAND_M2 = 20000;
// 約 1m
const PRECISION = 0.00001;
// lib/exploredCells.ts の CELL_RESOLUTION と同じ値にする。変えたら生成し直す
const CELL_RESOLUTION = 8;

// 郵便番号データにない北方領土の村と、別の字体 (須惠町) で載っている町
const ENGLISH_NAME_OVERRIDES = {
  "01695": "Shikotan",
  "01697": "Ruyobetsu",
  "01698": "Rubetsu",
  "01699": "Shana",
  "01700": "Shibetoro",
  "40344": "Sue",
};

const [shpPath, romajiPath] = process.argv.slice(2);
if (!shpPath?.endsWith(".shp") || !romajiPath) {
  console.error("Usage: npm run generate:boundaries -- <path to N03-YYYYMMDD.shp> <path to KEN_ALL_ROME.CSV>");
  process.exit(1);
}

const input = {};
for (const extension of ["shp", "shx", "dbf", "prj", "cpg"]) {
  input[`n03.${extension}`] = readFileSync(shpPath.replace(/\.shp$/, `.${extension}`));
}

// 所属未定地は行政区域コードが xx000。政令市は区 (N03_005) ごとに分かれているため市でまとめる
// 北海道には泊村が2つあるため、名前ではなく行政区域コードでまとめる
const municipalityOutput = await mapshaper.applyCommands(
  [
    "-i n03.shp",
    "-filter '!N03_007.endsWith(\"000\")'",
    "-each 'prefecture = N03_007.slice(0, 2), key = N03_005 ? N03_001 + N03_004 : N03_007, code = +N03_007, ward = !!N03_005'",
    "-dissolve2 key copy-fields=prefecture,N03_001,N03_004,ward calc='minCode = min(code)'",
    `-filter-islands min-area=${MIN_ISLAND_M2} remove-empty`,
    `-simplify interval=${MUNICIPALITY_SIMPLIFY_M} keep-shapes`,
    // 政令市のコードは区のコードの1の位を0にしたもの (例: 静岡市葵区 22101 → 静岡市 22100)
    "-each 'id = ward ? String(Math.floor(minCode / 10) * 10).padStart(5, \"0\") : key'",
    `-o municipalities.json format=geojson precision=${PRECISION}`,
  ].join(" "),
  input,
);
const municipalities = JSON.parse(municipalityOutput["municipalities.json"]);

// 境界を共有したまま間引いた市区町村からまとめると、都道府県の境目が市区町村の外枠とずれない
const prefectureOutput = await mapshaper.applyCommands(
  [
    "-i municipalities.json",
    "-dissolve2 prefecture copy-fields=N03_001",
    `-simplify interval=${PREFECTURE_SIMPLIFY_M} keep-shapes`,
    `-o prefectures.json format=geojson precision=${PRECISION}`,
  ].join(" "),
  { "municipalities.json": municipalityOutput["municipalities.json"] },
);
const prefectures = JSON.parse(prefectureOutput["prefectures.json"]);

function toEnglishName(romaji) {
  // 郵便番号データは「ん」の後の b・m・p を m と書くが (GUMMA)、英語表記では n が一般的 (Gunma)
  const name = romaji.replace(/M(?=[BMP])/g, "N");
  return name[0] + name.slice(1).toLowerCase();
}

// 列は郵便番号、都道府県、市区町村、町域と、その3つのローマ字 (大文字)
function readEnglishNames(path) {
  const csv = new TextDecoder("shift_jis").decode(readFileSync(path));
  const names = new Map();
  for (const line of csv.trim().split(/\r?\n/)) {
    const [, prefecture, municipality, , prefectureRomaji, municipalityRomaji] = line.slice(1, -1).split('","');
    // 「静岡市　葵区」「田方郡　函南町」「三宅島　三宅村」の形があり、名前は区より前、郡・島より後にある
    const parts = municipality.split("　");
    const words = municipalityRomaji.split(" ");
    const prefixWords = parts.length === 1 || parts[0].endsWith("市") ? 0 : parts[0].endsWith("郡") ? 2 : 1;
    const japaneseName = parts[prefixWords === 0 ? 0 : 1];
    // 長い名前は 35 文字で切られ、末尾の SHI や MACHI が欠けることがあるため、最初の語だけを使う
    names.set(`${prefecture}|${japaneseName}`, toEnglishName(words[prefixWords]));
    names.set(prefecture, toEnglishName(prefectureRomaji.split(" ")[0]));
  }
  return names;
}

const englishNames = readEnglishNames(romajiPath);

function toMultiPolygon(geometry) {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

function bounds(coordinates) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const polygon of coordinates) {
    for (const [lng, lat] of polygon[0]) {
      west = Math.min(west, lng);
      east = Math.max(east, lng);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  }
  return [west, south, east, north].map(round);
}

function round(value) {
  return Number(value.toFixed(5));
}

// 湾を囲む市など重心が範囲の外に出る形でも範囲内に置くため、重心に一番近いセルの中心にする
function findLabelPoint(cells) {
  if (cells.length === 0) return null;
  const centers = cells.map((cell) => cellToLatLng(cell));
  const meanLat = centers.reduce((sum, [lat]) => sum + lat, 0) / centers.length;
  const meanLng = centers.reduce((sum, [, lng]) => sum + lng, 0) / centers.length;
  let nearest = centers[0];
  let nearestDistance = Infinity;
  for (const center of centers) {
    const distance = (center[0] - meanLat) ** 2 + (center[1] - meanLng) ** 2;
    if (distance < nearestDistance) {
      nearest = center;
      nearestDistance = distance;
    }
  }
  return [round(nearest[1]), round(nearest[0])];
}

function write(relativePath, data) {
  const path = join(destination, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  const json = JSON.stringify(data);
  writeFileSync(path, json);
  return json.length;
}

rmSync(destination, { recursive: true, force: true });

// 表示する範囲だけを読み込めるよう、1件ずつ別のファイルにする
// 北海道全体のセルを求めるとスマホでは数秒止まるため、セル数とバッジの位置はここで求めておく
const index = { resolution: CELL_RESOLUTION, municipality: [], prefecture: [] };
const levels = [
  {
    level: "municipality",
    collection: municipalities,
    idField: "id",
    nameField: "N03_004",
    englishKey: (properties) => `${properties.N03_001}|${properties.N03_004}`,
  },
  {
    level: "prefecture",
    collection: prefectures,
    idField: "prefecture",
    nameField: "N03_001",
    englishKey: (properties) => properties.N03_001,
  },
];
const missingEnglishNames = [];
let total = 0;
for (const { level, collection, idField, nameField, englishKey } of levels) {
  for (const { properties, geometry } of collection.features) {
    if (!geometry) continue;
    const id = properties[idField];
    const nameEn = ENGLISH_NAME_OVERRIDES[id] ?? englishNames.get(englishKey(properties));
    if (!nameEn) missingEnglishNames.push(`${id} ${properties[nameField]}`);
    const coordinates = toMultiPolygon(geometry);
    // 探索済みのセルと同じく、中心が範囲内にあるセルを数える
    const cells = coordinates.flatMap((polygon) => polygonToCells(polygon, CELL_RESOLUTION, true));
    index[level].push({
      id,
      name: properties[nameField],
      nameEn,
      bbox: bounds(coordinates),
      cellCount: cells.length,
      labelPoint: findLabelPoint(cells),
    });
    total += write(join(level, `${id}.json`), { type: "MultiPolygon", coordinates });
  }
  index[level].sort((a, b) => a.id.localeCompare(b.id));
}
if (missingEnglishNames.length > 0) {
  // 合併などで郵便番号データと名前が合わなくなったら、ENGLISH_NAME_OVERRIDES に足す
  console.error(`English names not found:\n${missingEnglishNames.join("\n")}`);
  process.exit(1);
}
total += write("index.json", index);

console.log(
  `Generated ${index.municipality.length} municipalities and ${index.prefecture.length} prefectures from ${basename(shpPath)} (${(total / 1024 / 1024).toFixed(1)} MB)`,
);
