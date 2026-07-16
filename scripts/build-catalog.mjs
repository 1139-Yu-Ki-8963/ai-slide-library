#!/usr/bin/env node
// docs/スライド蓄積簿.md の表と slides/ 配下の実体から index.html のカタログデータを再生成する。
// 依存パッケージなし。実行: node scripts/build-catalog.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ledgerPath = join(root, "docs", "スライド蓄積簿.md");
const indexPath = join(root, "index.html");

const ledger = readFileSync(ledgerPath, "utf8");

// 「## スライド一覧」節の表行のみを対象にする
const section = ledger.split(/^## スライド一覧$/m)[1];
if (!section) {
  console.error("エラー: docs/スライド蓄積簿.md に「## スライド一覧」節がありません");
  process.exit(1);
}

const slides = [];
for (const line of section.split("\n")) {
  const cells = line.split("|").map(c => c.trim());
  // 表行は [ "", key, target, problems, date, "" ] の 6 要素
  if (cells.length !== 6 || !cells[1]) continue;
  const [, key, target, problems, date] = cells;
  if (key === "スライドキー" || /^-+$/.test(key)) continue;

  const slideFile = join(root, "slides", key, "解説スライド.html");
  if (!existsSync(slideFile)) {
    console.error(`警告: slides/${key}/解説スライド.html が存在しないためスキップします`);
    continue;
  }
  const html = readFileSync(slideFile, "utf8");
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1]?.trim() || key;
  const tags = key
    .split("-")
    .filter(seg => seg.endsWith("観点"))
    .map(seg => seg.slice(0, -2));
  slides.push({ key, title, target, problems, date, tags });
}

if (slides.length === 0) {
  console.error("エラー: 蓄積簿から有効なスライド行を読み取れませんでした");
  process.exit(1);
}

const indexHtml = readFileSync(indexPath, "utf8");
const marker = /\/\*CATALOG-DATA-START\*\/[\s\S]*?\/\*CATALOG-DATA-END\*\//;
if (!marker.test(indexHtml)) {
  console.error("エラー: index.html に CATALOG-DATA マーカーがありません");
  process.exit(1);
}
const dataBlock =
  "/*CATALOG-DATA-START*/\n" +
  `const SLIDES = ${JSON.stringify(slides, null, 2)};\n` +
  "/*CATALOG-DATA-END*/";
writeFileSync(indexPath, indexHtml.replace(marker, dataBlock));
console.log(`index.html を再生成しました（スライド ${slides.length} 枚）`);
