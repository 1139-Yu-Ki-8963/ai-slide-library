#!/usr/bin/env node
// バリアントグループ定義（docs/スライド蓄積簿.md「## バリアントグループ定義」節）が
// build-catalog.mjs によって index.html に正しく出力されることを検証する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = join(root, "index.html");
const buildScript = join(root, "scripts", "build-catalog.mjs");

function extractVariantGroups(html) {
  const startMarker = "const VARIANT_GROUPS = ";
  const startIdx = html.indexOf(startMarker);
  assert.notEqual(startIdx, -1, "index.html に const VARIANT_GROUPS = が見つかりません");
  const afterStart = startIdx + startMarker.length;
  const endIdx = html.indexOf(";\n", afterStart);
  assert.notEqual(endIdx, -1, "VARIANT_GROUPS 定義の終端（;\\n）が見つかりません");
  const jsonText = html.slice(afterStart, endIdx);
  return JSON.parse(jsonText);
}

test("build-catalog が正常終了する", () => {
  assert.doesNotThrow(() => {
    execFileSync("node", [buildScript], { cwd: root, stdio: "pipe" });
  });
});

test("VARIANT_GROUPS が index.html に出力される", () => {
  const html = readFileSync(indexPath, "utf8");
  const dataBlockMatch = html.match(/\/\*CATALOG-DATA-START\*\/([\s\S]*?)\/\*CATALOG-DATA-END\*\//);
  assert.ok(dataBlockMatch, "CATALOG-DATA マーカーが見つかりません");

  const variantGroups = extractVariantGroups(html);

  assert.equal(variantGroups.length, 3, "グループ数は 3 であるべき");

  const names = new Set(variantGroups.map(g => g.name));
  assert.deepEqual(names, new Set(["テンプレート構成", "リポジトリ整備", "AI導入計画"]));

  const templateGroup = variantGroups.find(g => g.name === "テンプレート構成");
  assert.ok(templateGroup, "「テンプレート構成」グループが見つかりません");
  assert.equal(templateGroup.canonical, "claude-code-テンプレート構成");
  const templateKeys = new Set(templateGroup.members.map(m => m.key));
  assert.deepEqual(
    templateKeys,
    new Set(["claude-code-テンプレート構成", "cursor-テンプレート構成", "codex-テンプレート構成"]),
  );
  const templateSlugs = new Set(templateGroup.members.map(m => m.slug));
  assert.deepEqual(templateSlugs, new Set(["claude-code", "cursor", "codex"]));

  const aiPlanGroup = variantGroups.find(g => g.name === "AI導入計画");
  assert.ok(aiPlanGroup, "「AI導入計画」グループが見つかりません");
  assert.equal(aiPlanGroup.kind, "view");
  assert.equal(aiPlanGroup.canonical, "四半期計画-AI整備計画表");
});

// --- テンプレート構成の統合スライド化（タブ切替統合） ---

const canonicalSlidePath = join(root, "slides", "claude-code-テンプレート構成", "解説スライド.html");
const cursorSlidePath = join(root, "slides", "cursor-テンプレート構成", "解説スライド.html");
const codexSlidePath = join(root, "slides", "codex-テンプレート構成", "解説スライド.html");

test("統合スライドが3variantを内蔵する", () => {
  const html = readFileSync(canonicalSlidePath, "utf8");
  assert.ok(html.includes("const VARIANTS"), "const VARIANTS が見つかりません");
  assert.ok(html.includes("claude-code"), "スラッグ claude-code が見つかりません");
  assert.ok(html.includes("cursor"), "スラッグ cursor が見つかりません");
  assert.ok(html.includes("codex"), "スラッグ codex が見つかりません");

  // claude-code 固有の文言（旧 claude-code 版にしか無かった実文言）
  assert.ok(html.includes("CLAUDE.md"), "claude-code 固有文言「CLAUDE.md」が見つかりません");
  assert.ok(html.includes(".claude/rules"), "claude-code 固有文言「.claude/rules」が見つかりません");

  // cursor 固有の文言（旧 cursor 版にしか無かった実文言）
  assert.ok(html.includes(".cursor/rules"), "cursor 固有文言「.cursor/rules」が見つかりません");
  assert.ok(html.includes(".cursorignore"), "cursor 固有文言「.cursorignore」が見つかりません");

  // codex 固有の文言（旧 codex 版にしか無かった実文言）
  assert.ok(html.includes(".codex/config.toml"), "codex 固有文言「.codex/config.toml」が見つかりません");
  assert.ok(html.includes("sandbox_mode"), "codex 固有文言「sandbox_mode」が見つかりません");
});

test("タブUIが存在する", () => {
  const html = readFileSync(canonicalSlidePath, "utf8");
  assert.ok(html.includes("variant-tabs"), "variant-tabs（タブバーの id/class）が見つかりません");
  assert.ok(html.includes("location.hash"), "location.hash 参照が見つかりません");
});

test("転送ページが代表を指す", () => {
  const cursorHtml = readFileSync(cursorSlidePath, "utf8");
  assert.ok(cursorHtml.includes('http-equiv="refresh"'), "cursor 転送ページに http-equiv=\"refresh\" が見つかりません");
  assert.ok(
    cursorHtml.includes("../claude-code-テンプレート構成/解説スライド.html#cursor"),
    "cursor 転送ページに代表スライドへの参照（#cursor）が見つかりません",
  );

  const codexHtml = readFileSync(codexSlidePath, "utf8");
  assert.ok(codexHtml.includes('http-equiv="refresh"'), "codex 転送ページに http-equiv=\"refresh\" が見つかりません");
  assert.ok(
    codexHtml.includes("../claude-code-テンプレート構成/解説スライド.html#codex"),
    "codex 転送ページに代表スライドへの参照（#codex）が見つかりません",
  );
});

test("転送ページがtitleを保持する", () => {
  const cursorHtml = readFileSync(cursorSlidePath, "utf8");
  const cursorTitle = (cursorHtml.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
  assert.ok(cursorTitle.includes("Cursor"), `cursor 転送ページの <title> に「Cursor」が含まれていません（実際: ${cursorTitle}）`);

  const codexHtml = readFileSync(codexSlidePath, "utf8");
  const codexTitle = (codexHtml.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
  assert.ok(codexTitle.includes("Codex"), `codex 転送ページの <title> に「Codex」が含まれていません（実際: ${codexTitle}）`);
});

// --- リポジトリ整備の統合スライド化（タブ切替統合） ---

const repoSeibiCanonicalPath = join(root, "slides", "リポジトリ整備-claude-code版-現状理想対比", "解説スライド.html");
const repoSeibiCursorPath = join(root, "slides", "リポジトリ整備-cursor版-現状理想対比", "解説スライド.html");
const repoSeibiCodexPath = join(root, "slides", "リポジトリ整備-codex版-現状理想対比", "解説スライド.html");

test("リポジトリ整備 統合スライドが3variantを内蔵する", () => {
  const html = readFileSync(repoSeibiCanonicalPath, "utf8");
  assert.ok(html.includes("const VARIANTS"), "const VARIANTS が見つかりません");
  assert.ok(html.includes("claude-code"), "スラッグ claude-code が見つかりません");
  assert.ok(html.includes("cursor"), "スラッグ cursor が見つかりません");
  assert.ok(html.includes("codex"), "スラッグ codex が見つかりません");

  // cursor 固有の代表文言（旧 cursor 版にしか無かった実文言）
  assert.ok(html.includes(".cursor/rules/"), "cursor 固有文言「.cursor/rules/」が見つかりません");
  assert.ok(html.includes("SKILL.md"), "cursor 固有文言「SKILL.md」が見つかりません");

  // codex 固有の代表文言（旧 codex 版にしか無かった実文言）
  assert.ok(html.includes("AGENTS.md に集約"), "codex 固有文言「AGENTS.md に集約」が見つかりません");
  assert.ok(
    html.includes("Codex CLI は設定ファイルが少ない分"),
    "codex 固有文言「Codex CLI は設定ファイルが少ない分」が見つかりません",
  );
});

test("リポジトリ整備 タブUIが存在する", () => {
  const html = readFileSync(repoSeibiCanonicalPath, "utf8");
  assert.ok(html.includes("variant-tabs"), "variant-tabs（タブバーの id/class）が見つかりません");
  assert.ok(html.includes("location.hash"), "location.hash 参照が見つかりません");
});

test("リポジトリ整備 転送ページが代表を指す", () => {
  const cursorHtml = readFileSync(repoSeibiCursorPath, "utf8");
  assert.ok(cursorHtml.includes('http-equiv="refresh"'), "cursor 転送ページに http-equiv=\"refresh\" が見つかりません");
  assert.ok(
    cursorHtml.includes("../リポジトリ整備-claude-code版-現状理想対比/解説スライド.html#cursor"),
    "cursor 転送ページに代表スライドへの参照（#cursor）が見つかりません",
  );

  const codexHtml = readFileSync(repoSeibiCodexPath, "utf8");
  assert.ok(codexHtml.includes('http-equiv="refresh"'), "codex 転送ページに http-equiv=\"refresh\" が見つかりません");
  assert.ok(
    codexHtml.includes("../リポジトリ整備-claude-code版-現状理想対比/解説スライド.html#codex"),
    "codex 転送ページに代表スライドへの参照（#codex）が見つかりません",
  );
});

test("リポジトリ整備 転送ページがtitleを保持する", () => {
  const cursorHtml = readFileSync(repoSeibiCursorPath, "utf8");
  const cursorTitle = (cursorHtml.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
  assert.ok(cursorTitle.includes("Cursor"), `cursor 転送ページの <title> に「Cursor」が含まれていません（実際: ${cursorTitle}）`);

  const codexHtml = readFileSync(repoSeibiCodexPath, "utf8");
  const codexTitle = (codexHtml.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
  assert.ok(codexTitle.includes("Codex"), `codex 転送ページの <title> に「Codex」が含まれていません（実際: ${codexTitle}）`);
});
