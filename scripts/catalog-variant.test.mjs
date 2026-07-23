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
