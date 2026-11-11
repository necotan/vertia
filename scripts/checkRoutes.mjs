// public/sw.js が保存するページの一覧と app/ のページが一致しているかを検査する
// 一覧にないページはオフラインで開けず、動的ルートは事前に保存できない
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(root, "app");

const routes = readdirSync(appDir, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name === "page.tsx")
  .map((entry) => {
    const segments = entry.parentPath.slice(appDir.length).split(/[\\/]/).filter(Boolean);
    // (group) は URL に現れない
    return `/${segments.filter((segment) => !segment.startsWith("(")).join("/")}`;
  });

const source = readFileSync(join(root, "public", "sw.js"), "utf8");
const list = /const PAGES = \[([^\]]*)\]/.exec(source);
if (!list) {
  console.error("public/sw.js に PAGES の定義が見つかりません");
  process.exit(1);
}
const pages = [...list[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);

const errors = [
  ...routes
    .filter((route) => route.includes("["))
    .map((route) => `${route}: 動的ルートは Service Worker が事前に保存できません。クエリで受け取る静的ページにしてください`),
  ...routes
    .filter((route) => !route.includes("[") && !pages.includes(route))
    .map((route) => `${route}: public/sw.js の PAGES に追加してください`),
  ...pages
    .filter((page) => !routes.includes(page))
    .map((page) => `${page}: public/sw.js の PAGES にありますが、app/ にページがありません`),
];

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
