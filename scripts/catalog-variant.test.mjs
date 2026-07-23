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

// --- カタログ一覧のバリアントグループ束ね表示（描画コード） ---

test("描画コードが VARIANT_GROUPS を参照する（データブロック外）", () => {
  const html = readFileSync(indexPath, "utf8");
  const endMarker = "/*CATALOG-DATA-END*/";
  const endIdx = html.indexOf(endMarker);
  assert.notEqual(endIdx, -1, "CATALOG-DATA-END マーカーが見つかりません");
  const afterData = html.slice(endIdx + endMarker.length);
  assert.ok(
    afterData.includes("VARIANT_GROUPS"),
    "データブロック外（描画コード側）に VARIANT_GROUPS を参照するコードが見つかりません",
  );
});

test("束ねカードのバッジ文字列生成コードが存在する", () => {
  const html = readFileSync(indexPath, "utf8");
  assert.ok(html.includes("ツール対応"), "「◯ツール対応」バッジ文言の生成コードが見つかりません");
  assert.ok(html.includes("表示形式"), "「◯表示形式」バッジ文言の生成コードが見つかりません");
});

test("ツール別ダウンロードの保存ファイル名テンプレートが存在する", () => {
  const html = readFileSync(indexPath, "utf8");
  assert.ok(
    html.includes("版）.html"),
    "ダウンロード保存名テンプレート（`◯◯版）.html`）が見つかりません",
  );
});

test("束ねカードの「開く」「ダウンロード」行ラベルが存在する", () => {
  const html = readFileSync(indexPath, "utf8");
  assert.ok(html.includes("開く:"), "「開く:」ラベルが見つかりません");
  assert.ok(html.includes("ダウンロード:"), "「ダウンロード:」ラベルが見つかりません");
});

// --- AI導入計画の統合スライド化（表示形式スイッチャー統合） ---

const aiPlanCanonicalPath = join(root, "slides", "四半期計画-AI整備計画表", "解説スライド.html");
const aiPlanProcessFlowPath = join(root, "slides", "工程時系列-AI導入手順", "解説スライド.html");
const aiPlanStageCardsPath = join(root, "slides", "AI駆動開発導入-五段階計画表", "解説スライド.html");

test("AI導入計画 統合スライドが3表示形式を内蔵する", () => {
  const html = readFileSync(aiPlanCanonicalPath, "utf8");
  assert.ok(html.includes("gantt"), "スラッグ gantt が見つかりません");
  assert.ok(html.includes("process-flow"), "スラッグ process-flow が見つかりません");
  assert.ok(html.includes("stage-cards"), "スラッグ stage-cards が見つかりません");
  assert.ok(
    html.includes('data-view="gantt"'),
    "data-view=\"gantt\" セクションが見つかりません",
  );
  assert.ok(
    html.includes('data-view="process-flow"'),
    "data-view=\"process-flow\" セクションが見つかりません",
  );
  assert.ok(
    html.includes('data-view="stage-cards"'),
    "data-view=\"stage-cards\" セクションが見つかりません",
  );

  // 工程表版の代表文言（旧 工程時系列-AI導入手順 にしか無かった実文言）
  assert.ok(html.includes("AI導入プロジェクトの工程時系列"), "工程表 固有文言「AI導入プロジェクトの工程時系列」が見つかりません");
  assert.ok(html.includes("既存コードの可読性・テスト・文書化状態を評価"), "工程表 固有文言「既存コードの可読性・テスト・文書化状態を評価」が見つかりません");

  // ステージカード版の代表文言（旧 AI駆動開発導入-五段階計画表 にしか無かった実文言）
  assert.ok(html.includes("AI駆動開発の導入は5段階で進める"), "ステージカード 固有文言「AI駆動開発の導入は5段階で進める」が見つかりません");
  assert.ok(html.includes("よくある失敗"), "ステージカード 固有文言「よくある失敗」が見つかりません");
});

test("AI導入計画 表示形式スイッチャーUIが存在する", () => {
  const html = readFileSync(aiPlanCanonicalPath, "utf8");
  assert.ok(html.includes("view-tabs"), "view-tabs（タブバーの id/class）が見つかりません");
  assert.ok(html.includes("location.hash"), "location.hash 参照が見つかりません");
});

test("AI導入計画 転送ページが代表を指す", () => {
  const processFlowHtml = readFileSync(aiPlanProcessFlowPath, "utf8");
  assert.ok(processFlowHtml.includes('http-equiv="refresh"'), "工程表 転送ページに http-equiv=\"refresh\" が見つかりません");
  assert.ok(
    processFlowHtml.includes("../四半期計画-AI整備計画表/解説スライド.html#process-flow"),
    "工程表 転送ページに代表スライドへの参照（#process-flow）が見つかりません",
  );

  const stageCardsHtml = readFileSync(aiPlanStageCardsPath, "utf8");
  assert.ok(stageCardsHtml.includes('http-equiv="refresh"'), "ステージカード 転送ページに http-equiv=\"refresh\" が見つかりません");
  assert.ok(
    stageCardsHtml.includes("../四半期計画-AI整備計画表/解説スライド.html#stage-cards"),
    "ステージカード 転送ページに代表スライドへの参照（#stage-cards）が見つかりません",
  );
});

test("AI導入計画 転送ページがtitleを保持する", () => {
  const processFlowHtml = readFileSync(aiPlanProcessFlowPath, "utf8");
  const processFlowTitle = (processFlowHtml.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
  assert.ok(
    processFlowTitle.includes("工程時系列"),
    `工程表 転送ページの <title> に「工程時系列」が含まれていません（実際: ${processFlowTitle}）`,
  );

  const stageCardsHtml = readFileSync(aiPlanStageCardsPath, "utf8");
  const stageCardsTitle = (stageCardsHtml.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
  assert.ok(
    stageCardsTitle.includes("5段階"),
    `ステージカード 転送ページの <title> に「5段階」が含まれていません（実際: ${stageCardsTitle}）`,
  );
});

// --- CSS 乖離検査スクリプト ---

const cssDriftScript = join(root, "scripts", "check-css-drift.mjs");

test("check-css-drift.mjs が exit 0 で終了する", () => {
  const output = execFileSync("node", [cssDriftScript], { cwd: root, encoding: "utf8" });
  assert.ok(output.length > 0, "標準出力が空です");
});

test("check-css-drift.mjs が集計行を出す", () => {
  const output = execFileSync("node", [cssDriftScript], { cwd: root, encoding: "utf8" });
  assert.match(output, /対象\s*\d+\s*ファイル/, "「対象」を含む集計行が見つかりません");
  assert.match(output, /共有セレクタ\s*\d+\s*件/, "「共有セレクタ」を含む集計行が見つかりません");
  assert.match(output, /乖離\s*\d+\s*件/, "「乖離」を含む集計行が見つかりません");
});

// --- 統合スライド3枚の関連スライドリンク ---

test("claude-code-テンプレート構成 に related-links が存在する", () => {
  const html = readFileSync(canonicalSlidePath, "utf8");
  assert.ok(html.includes('id="related-links"'), "id=\"related-links\" が見つかりません");
  assert.ok(
    html.includes("../リポジトリ整備-claude-code版-現状理想対比/解説スライド.html"),
    "リポジトリ整備への相対リンクが見つかりません",
  );
  assert.ok(
    html.includes("../四半期計画-AI整備計画表/解説スライド.html"),
    "AI導入計画への相対リンクが見つかりません",
  );
});

test("リポジトリ整備-claude-code版-現状理想対比 に related-links が存在する", () => {
  const html = readFileSync(repoSeibiCanonicalPath, "utf8");
  assert.ok(html.includes('id="related-links"'), "id=\"related-links\" が見つかりません");
  assert.ok(
    html.includes("../claude-code-テンプレート構成/解説スライド.html"),
    "テンプレート構成への相対リンクが見つかりません",
  );
  assert.ok(
    html.includes("../四半期計画-AI整備計画表/解説スライド.html"),
    "AI導入計画への相対リンクが見つかりません",
  );
});

test("四半期計画-AI整備計画表 に related-links が存在する", () => {
  const html = readFileSync(aiPlanCanonicalPath, "utf8");
  assert.ok(html.includes('id="related-links"'), "id=\"related-links\" が見つかりません");
  assert.ok(
    html.includes("../claude-code-テンプレート構成/解説スライド.html"),
    "テンプレート構成への相対リンクが見つかりません",
  );
  assert.ok(
    html.includes("../リポジトリ整備-claude-code版-現状理想対比/解説スライド.html"),
    "リポジトリ整備への相対リンクが見つかりません",
  );
});
