#!/usr/bin/env node
// docs/スライド蓄積簿.md の語彙一覧・スライド一覧から index.html のカタログデータを再生成する。
// 依存パッケージなし。実行: node scripts/build-catalog.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ledgerPath = join(root, "docs", "スライド蓄積簿.md");
const indexPath = join(root, "index.html");
const promptsPath = join(root, "catalog-prompts.json");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ledger = readFileSync(ledgerPath, "utf8");

// --- タグ語彙一覧の読み取り ---
const vocabSection = ledger.split(/^## タグ語彙一覧$/m)[1]?.split(/^## /m)[0];
if (!vocabSection) {
  console.error("エラー: docs/スライド蓄積簿.md に「## タグ語彙一覧」節がありません");
  process.exit(1);
}
const AXIS_KEYS = { "対象ツール": "tools", "仕組み": "mechanisms", "テーマ": "themes" };
const vocab = { tools: [], mechanisms: [], themes: [] };
for (const line of vocabSection.split("\n")) {
  const cells = line.split("|").map(c => c.trim());
  if (cells.length !== 4) continue;
  const axisKey = AXIS_KEYS[cells[1]];
  if (!axisKey) continue;
  vocab[axisKey] = cells[2].split("/").map(s => s.trim()).filter(Boolean);
}
for (const [axis, words] of Object.entries(vocab)) {
  if (words.length === 0) {
    console.error(`エラー: タグ語彙一覧の軸「${axis}」が読み取れませんでした`);
    process.exit(1);
  }
}

// --- スライド一覧の読み取り ---
const section = ledger.split(/^## スライド一覧$/m)[1];
if (!section) {
  console.error("エラー: docs/スライド蓄積簿.md に「## スライド一覧」節がありません");
  process.exit(1);
}

// 「、」区切りの複数値セルを配列にする（「—」は該当なし）
const splitTags = cell => {
  const c = cell.trim();
  if (c === "" || c === "—" || c === "-") return [];
  return c.split("、").map(s => s.trim()).filter(Boolean);
};

const slides = [];
const prompts = {};
const unknownTags = [];
const validationErrors = [];
for (const line of section.split("\n")) {
  const cells = line.split("|").map(c => c.trim());
  // 表行は [ "", key, target, problems, tools, mechanisms, themes, entities, pack, importPrompt, date, "" ] の 12 要素
  if (cells.length !== 12 || !cells[1]) continue;
  const [, key, target, problems, tools, mechanisms, themes, entities, pack, importPrompt, date] = cells;
  if (key === "スライドキー" || /^-+$/.test(key)) continue;

  // 必須フィールドの空チェック
  for (const [fieldName, value] of [["説明対象", target], ["提示する課題の例", problems], ["登録日", date]]) {
    if (!value) validationErrors.push(`${key}: 必須項目「${fieldName}」が空です`);
  }
  // date 形式チェック
  if (date && !DATE_RE.test(date)) {
    validationErrors.push(`${key}: 登録日「${date}」が YYYY-MM-DD 形式ではありません`);
  }

  const slideFile = join(root, "slides", key, "解説スライド.html");
  if (!existsSync(slideFile)) {
    validationErrors.push(`${key}: slides/${key}/解説スライド.html が存在しません`);
    continue;
  }
  const thumbFile = join(root, "slides", key, "サムネイル.png");
  if (!existsSync(thumbFile)) {
    validationErrors.push(`${key}: slides/${key}/サムネイル.png が存在しません`);
    continue;
  }
  const html = readFileSync(slideFile, "utf8");
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1]?.trim() || key;
  if (!title) validationErrors.push(`${key}: 必須項目「タイトル」が空です`);

  // 「導入プロンプト」列は「あり」または「—」のみ許可
  const importPromptValue = importPrompt.trim();
  if (importPromptValue !== "あり" && importPromptValue !== "—") {
    validationErrors.push(`${key}: 「導入プロンプト」列の値「${importPromptValue}」が不正です（「あり」または「—」のみ許可）`);
  }
  const promptFile = join(root, "slides", key, "取り込みプロンプト.md");
  let prompt = "";
  if (importPromptValue === "あり") {
    if (!existsSync(promptFile)) {
      validationErrors.push(`${key}: 「導入プロンプト」列が「あり」ですが slides/${key}/取り込みプロンプト.md が存在しません`);
    } else {
      prompt = readFileSync(promptFile, "utf8");
      prompts[key] = prompt;
    }
  }
  const entry = {
    key,
    title,
    target,
    problems,
    tools: splitTags(tools),
    mechanisms: splitTags(mechanisms),
    themes: splitTags(themes),
    entities: splitTags(entities),
    pack: pack.trim() === "あり",
    has_prompt: !!prompt,
    date,
  };
  for (const [axis, words] of [["tools", entry.tools], ["mechanisms", entry.mechanisms], ["themes", entry.themes]]) {
    for (const w of words) {
      if (!vocab[axis].includes(w)) unknownTags.push(`${key}: ${axis} 軸「${w}」`);
    }
  }
  slides.push(entry);
}

if (validationErrors.length > 0) {
  console.error("エラー: 蓄積簿のデータ検証に失敗しました。");
  for (const e of validationErrors) console.error(`  - ${e}`);
  process.exit(1);
}

if (unknownTags.length > 0) {
  console.error("エラー: タグ語彙一覧に無い語が使われています。先に語彙一覧へ追加してください。");
  for (const u of unknownTags) console.error(`  - ${u}`);
  process.exit(1);
}

if (slides.length === 0) {
  console.error("エラー: 蓄積簿から有効なスライド行を読み取れませんでした");
  process.exit(1);
}

const indexHtml = readFileSync(indexPath, "utf8");

// テンプレート指紋チェック: 古い checkout の index.html を土台に build すると
// 改善版テンプレート（PR #16）が失われるため、必須マーカーの欠落を即エラーにする
const TEMPLATE_MARKERS = ["visibleCount", "data-theme", "aria-live", "catalog-prompts.json"];
const missingMarkers = TEMPLATE_MARKERS.filter(m => !indexHtml.includes(m));
if (missingMarkers.length > 0) {
  console.error(`エラー: index.html が古いテンプレートです（欠落マーカー: ${missingMarkers.join(", ")}）。origin/main の最新 index.html を取り込んでから build してください。`);
  process.exit(1);
}

const marker = /\/\*CATALOG-DATA-START\*\/[\s\S]*?\/\*CATALOG-DATA-END\*\//;
if (!marker.test(indexHtml)) {
  console.error("エラー: index.html に CATALOG-DATA マーカーがありません");
  process.exit(1);
}
const dataBlock =
  "/*CATALOG-DATA-START*/\n" +
  `const VOCAB = ${JSON.stringify(vocab, null, 2)};\n` +
  `const SLIDES = ${JSON.stringify(slides, null, 2)};\n` +
  "/*CATALOG-DATA-END*/";
writeFileSync(indexPath, indexHtml.replace(marker, dataBlock));
writeFileSync(promptsPath, JSON.stringify(prompts, null, 2));
console.log(`index.html を再生成しました（スライド ${slides.length} 枚 / 語彙 ツール${vocab.tools.length}・仕組み${vocab.mechanisms.length}・テーマ${vocab.themes.length}）`);
console.log(`catalog-prompts.json を再生成しました（プロンプト ${Object.keys(prompts).length} 件）`);
