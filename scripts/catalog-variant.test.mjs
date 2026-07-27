#!/usr/bin/env node
// 現行の正式仕様:
// - 49登録のうち2組×3 variantを各1カードへ束ね、既定表示は45カード
// - 各variantはredirectではなく、固有HTML・タイトル・サムネイルを持つ
// - docs/スライド蓄積簿.md → build-catalog.mjs → index.html の定義を検証する
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = join(root, "index.html");
const buildScript = join(root, "scripts", "build-catalog.mjs");
const cssDriftScript = join(root, "scripts", "check-css-drift.mjs");

const EXPECTED_GROUPS = {
  "テンプレート構成": {
    canonical: "claude-code-テンプレート構成",
    members: [
      { key: "claude-code-テンプレート構成", slug: "claude-code", titlePattern: /Claude Code/ },
      { key: "cursor-テンプレート構成", slug: "cursor", titlePattern: /Cursor/ },
      { key: "codex-テンプレート構成", slug: "codex", titlePattern: /Codex/ },
    ],
  },
  "リポジトリ整備": {
    canonical: "リポジトリ整備-claude-code版-現状理想対比",
    members: [
      { key: "リポジトリ整備-claude-code版-現状理想対比", slug: "claude-code", titlePattern: /Claude Code/ },
      { key: "リポジトリ整備-cursor版-現状理想対比", slug: "cursor", titlePattern: /Cursor/ },
      { key: "リポジトリ整備-codex版-現状理想対比", slug: "codex", titlePattern: /Codex/ },
    ],
  },
};

function extractCatalogJson(html, name) {
  const startMarker = `const ${name} = `;
  const startIndex = html.indexOf(startMarker);
  assert.notEqual(startIndex, -1, `index.html に ${startMarker.trim()} が見つかりません`);
  const valueStart = startIndex + startMarker.length;
  const valueEnd = html.indexOf(";\n", valueStart);
  assert.notEqual(valueEnd, -1, `${name} 定義の終端（;\\n）が見つかりません`);
  return JSON.parse(html.slice(valueStart, valueEnd));
}

function readCatalogModel() {
  const html = readFileSync(indexPath, "utf8");
  return {
    html,
    slides: extractCatalogJson(html, "SLIDES"),
    groups: extractCatalogJson(html, "VARIANT_GROUPS"),
  };
}

function slidePaths(key) {
  return {
    html: join(root, "slides", key, "解説スライド.html"),
    thumbnail: join(root, "slides", key, "サムネイル.png"),
  };
}

function titleOf(htmlPath) {
  return (readFileSync(htmlPath, "utf8").match(/<title>([^<]+)<\/title>/i) || [])[1]?.trim() || "";
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function pngDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.toString("ascii", 1, 4), "PNG", `${path} はPNGではありません`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateVariantModel({ slides, groups }) {
  const errors = [];
  const slideKeys = new Set();
  for (const slide of slides) {
    if (slideKeys.has(slide.key)) errors.push({ code: "registered-key-duplicate", detail: slide.key });
    slideKeys.add(slide.key);
  }

  const groupsByName = new Map();
  const memberOwners = new Map();
  for (const group of groups) {
    if (groupsByName.has(group.name)) errors.push({ code: "group-duplicate", detail: group.name });
    groupsByName.set(group.name, group);
    const members = Array.isArray(group.members) ? group.members : [];
    const memberKeys = new Set();
    const slugs = new Set();
    for (const member of members) {
      if (!slideKeys.has(member.key)) errors.push({ code: "unknown-member", detail: member.key });
      if (memberKeys.has(member.key) || memberOwners.has(member.key)) {
        errors.push({ code: "member-duplicate", detail: member.key });
      }
      memberKeys.add(member.key);
      memberOwners.set(member.key, group.name);
      if (!member.slug || !member.label || slugs.has(member.slug)) {
        errors.push({ code: "variant-option-invalid", detail: member.key });
      }
      slugs.add(member.slug);
    }
    if (!slideKeys.has(group.canonical)) errors.push({ code: "unknown-canonical", detail: group.canonical });
    if (!memberKeys.has(group.canonical)) errors.push({ code: "canonical-not-member", detail: group.canonical });
  }

  const expectedNames = new Set(Object.keys(EXPECTED_GROUPS));
  const actualNames = new Set(groups.map(group => group.name));
  if (groups.length !== expectedNames.size || actualNames.size !== expectedNames.size) {
    errors.push({ code: "group-count", detail: `${groups.length}` });
  }
  for (const [name, expected] of Object.entries(EXPECTED_GROUPS)) {
    const actual = groupsByName.get(name);
    if (!actual) {
      errors.push({ code: "group-missing", detail: name });
      continue;
    }
    if (actual.canonical !== expected.canonical) {
      errors.push({ code: "canonical-mismatch", detail: `${name}:${actual.canonical}` });
    }
    const expectedMembers = new Set(expected.members.map(member => member.key));
    const actualMembers = new Set(actual.members.map(member => member.key));
    if (
      actual.members.length !== expected.members.length ||
      expectedMembers.size !== actualMembers.size ||
      [...expectedMembers].some(key => !actualMembers.has(key))
    ) {
      errors.push({ code: "member-set-mismatch", detail: name });
    }
    const expectedSlugs = new Set(expected.members.map(member => member.slug));
    const actualSlugs = new Set(actual.members.map(member => member.slug));
    if (expectedSlugs.size !== actualSlugs.size || [...expectedSlugs].some(slug => !actualSlugs.has(slug))) {
      errors.push({ code: "slug-set-mismatch", detail: name });
    }
  }
  for (const name of actualNames) {
    if (!expectedNames.has(name)) errors.push({ code: "unknown-group", detail: name });
  }

  const expectedCardCount = slideKeys.size - memberOwners.size + groups.length;
  return { errors, registeredCount: slideKeys.size, expectedCardCount, memberOwners };
}

function assertIndependentHtmlGroup(groupName) {
  const spec = EXPECTED_GROUPS[groupName];
  const contents = spec.members.map(member => {
    const paths = slidePaths(member.key);
    assert.ok(existsSync(paths.html), `${member.key}: 解説スライド.html がありません`);
    const html = readFileSync(paths.html, "utf8");
    assert.doesNotMatch(html, /http-equiv\s*=\s*["']refresh["']/i, `${member.key}: redirectが残っています`);
    return { member, paths, html };
  });
  return contents;
}

function assertTitlesAreProductSpecific(groupName) {
  const contents = assertIndependentHtmlGroup(groupName);
  const titles = contents.map(({ member, paths }) => {
    const title = titleOf(paths.html);
    assert.notEqual(title, "", `${member.key}: titleが空です`);
    assert.match(title, member.titlePattern, `${member.key}: 製品名を含む固有titleではありません`);
    return title;
  });
  assert.equal(new Set(titles).size, titles.length, `${groupName}: titleが重複しています`);
}

function assertUniqueFiles(groupName, field) {
  const paths = EXPECTED_GROUPS[groupName].members.map(member => slidePaths(member.key)[field]);
  for (const path of paths) assert.ok(existsSync(path), `${path} がありません`);
  assert.equal(new Set(paths.map(sha256)).size, paths.length, `${groupName}: ${field}の内容が重複しています`);
}

function assertThumbnailDimensions(groupName) {
  for (const member of EXPECTED_GROUPS[groupName].members) {
    const path = slidePaths(member.key).thumbnail;
    assert.ok(existsSync(path), `${member.key}: サムネイル.png がありません`);
    assert.deepEqual(pngDimensions(path), { width: 640, height: 360 }, `${member.key}: サムネイル寸法が不正です`);
  }
}

function expectVariantError(name, mutate, expectedCode) {
  test(name, () => {
    const model = readCatalogModel();
    const fixture = { slides: clone(model.slides), groups: clone(model.groups) };
    mutate(fixture);
    const result = validateVariantModel(fixture);
    assert.ok(
      result.errors.some(error => error.code === expectedCode),
      `${expectedCode}を検出できませんでした: ${JSON.stringify(result.errors)}`,
    );
  });
}

test("build-catalog が正常終了する", () => {
  assert.doesNotThrow(() => {
    execFileSync("node", [buildScript], { cwd: root, stdio: "pipe" });
  });
});

test("正式なバリアントグループ数は2組", () => {
  assert.equal(readCatalogModel().groups.length, 2);
});

test("正式なグループ名はテンプレート構成とリポジトリ整備", () => {
  assert.deepEqual(
    new Set(readCatalogModel().groups.map(group => group.name)),
    new Set(Object.keys(EXPECTED_GROUPS)),
  );
});

test("各グループは3variantを保持する", () => {
  for (const group of readCatalogModel().groups) assert.equal(group.members.length, 3, group.name);
});

test("テンプレート構成の代表キー・メンバー・slugが正式仕様と一致する", () => {
  const group = readCatalogModel().groups.find(item => item.name === "テンプレート構成");
  assert.equal(group.canonical, EXPECTED_GROUPS["テンプレート構成"].canonical);
  assert.deepEqual(
    new Set(group.members.map(member => member.key)),
    new Set(EXPECTED_GROUPS["テンプレート構成"].members.map(member => member.key)),
  );
  assert.deepEqual(
    new Set(group.members.map(member => member.slug)),
    new Set(EXPECTED_GROUPS["テンプレート構成"].members.map(member => member.slug)),
  );
});

test("リポジトリ整備の代表キー・メンバー・slugが正式仕様と一致する", () => {
  const group = readCatalogModel().groups.find(item => item.name === "リポジトリ整備");
  assert.equal(group.canonical, EXPECTED_GROUPS["リポジトリ整備"].canonical);
  assert.deepEqual(
    new Set(group.members.map(member => member.key)),
    new Set(EXPECTED_GROUPS["リポジトリ整備"].members.map(member => member.key)),
  );
  assert.deepEqual(
    new Set(group.members.map(member => member.slug)),
    new Set(EXPECTED_GROUPS["リポジトリ整備"].members.map(member => member.slug)),
  );
});

test("登録スライドは49件", () => {
  assert.equal(readCatalogModel().slides.length, 49);
});

test("49登録から2組の3variantを束ねると既定カードは45件", () => {
  const result = validateVariantModel(readCatalogModel());
  assert.equal(result.expectedCardCount, 45);
});

test("variantメンバーはグループ内・グループ間で重複しない", () => {
  const result = validateVariantModel(readCatalogModel());
  assert.ok(!result.errors.some(error => error.code === "member-duplicate"), JSON.stringify(result.errors));
  assert.equal(result.memberOwners.size, 6);
});

test("variantメンバーと代表キーは全て登録済みキー", () => {
  const result = validateVariantModel(readCatalogModel());
  assert.ok(!result.errors.some(error => error.code.startsWith("unknown-")), JSON.stringify(result.errors));
});

test("各代表キーは自身のグループメンバーに含まれる", () => {
  const result = validateVariantModel(readCatalogModel());
  assert.ok(!result.errors.some(error => error.code === "canonical-not-member"), JSON.stringify(result.errors));
});

test("生成済みカタログのバリアントモデルは全契約を満たす", () => {
  assert.deepEqual(validateVariantModel(readCatalogModel()).errors, []);
});

test("テンプレート構成3variantはredirectではなく独立HTML", () => {
  assert.equal(assertIndependentHtmlGroup("テンプレート構成").length, 3);
});

test("テンプレート構成3variantは製品別の固有titleを持つ", () => {
  assertTitlesAreProductSpecific("テンプレート構成");
});

test("テンプレート構成3variantのHTML内容は相互に異なる", () => {
  assertUniqueFiles("テンプレート構成", "html");
});

test("テンプレート構成3variantは各640×360サムネイルを持つ", () => {
  assertThumbnailDimensions("テンプレート構成");
});

test("テンプレート構成3variantのサムネイル内容は相互に異なる", () => {
  assertUniqueFiles("テンプレート構成", "thumbnail");
});

test("リポジトリ整備3variantはredirectではなく独立HTML", () => {
  assert.equal(assertIndependentHtmlGroup("リポジトリ整備").length, 3);
});

test("リポジトリ整備3variantは製品別の固有titleを持つ", () => {
  assertTitlesAreProductSpecific("リポジトリ整備");
});

test("リポジトリ整備3variantのHTML内容は相互に異なる", () => {
  assertUniqueFiles("リポジトリ整備", "html");
});

test("リポジトリ整備3variantは各640×360サムネイルを持つ", () => {
  assertThumbnailDimensions("リポジトリ整備");
});

test("リポジトリ整備3variantのサムネイル内容は相互に異なる", () => {
  assertUniqueFiles("リポジトリ整備", "thumbnail");
});

expectVariantError("variant欠落を拒否する", fixture => {
  fixture.groups[0].members.pop();
}, "member-set-mismatch");

expectVariantError("variant重複を拒否する", fixture => {
  fixture.groups[0].members.push(clone(fixture.groups[0].members[0]));
}, "member-duplicate");

expectVariantError("未知variantキーを拒否する", fixture => {
  fixture.groups[0].members[1].key = "unknown-slide-key";
}, "unknown-member");

expectVariantError("不正な代表キーを拒否する", fixture => {
  fixture.groups[0].canonical = fixture.slides.find(
    slide => !fixture.groups[0].members.some(member => member.key === slide.key),
  ).key;
}, "canonical-mismatch");

expectVariantError("variant選択肢のslug欠落を拒否する", fixture => {
  fixture.groups[0].members[0].slug = "";
}, "variant-option-invalid");

test("描画コードがデータブロック外でVARIANT_GROUPSを参照する", () => {
  const html = readCatalogModel().html;
  const endMarker = "/*CATALOG-DATA-END*/";
  const endIndex = html.indexOf(endMarker);
  assert.notEqual(endIndex, -1);
  assert.ok(html.slice(endIndex + endMarker.length).includes("VARIANT_GROUPS"));
});

test("束ねカードのバッジ文字列生成コードが存在する", () => {
  const html = readCatalogModel().html;
  assert.ok(html.includes("ツール対応"));
  assert.ok(html.includes("表示形式"));
});

test("廃止済みのvariantピル行描画が復活していない", () => {
  const html = readCatalogModel().html;
  assert.ok(!html.includes("renderVariantLinkRows"));
  assert.ok(!html.includes("variant-link-row"));
  assert.ok(!html.includes("variant-pill"));
  assert.ok(!html.includes("⬇ ダウンロード:"));
});

test("束ねカードはダウンロードせずスライドを開く", () => {
  const html = readCatalogModel().html;
  assert.ok(
    html.includes('? `<a class="act" href="${openPath}" target="_blank" rel="noopener"><span class="material-symbols-outlined">open_in_new</span>スライドを開く</a>`'),
  );
});

test("束ねカード用リンクにdownload属性がない", () => {
  const html = readCatalogModel().html;
  const match = html.match(/\? `<a class="act" href="\$\{openPath\}" target="_blank" rel="noopener">[\s\S]*?<\/a>`/);
  assert.ok(match);
  assert.ok(!match[0].includes("download"));
});

test("通常カードはdownload属性でスライドHTMLを保存する", () => {
  assert.ok(
    readCatalogModel().html.includes(
      ': `<a class="act" href="${openPath}" download="${esc(`${s.key}.html`)}"><span class="material-symbols-outlined">download</span>スライドHTML</a>`;',
    ),
  );
});

test("check-css-drift.mjs がexit 0で終了する", () => {
  const output = execFileSync("node", [cssDriftScript], { cwd: root, encoding: "utf8" });
  assert.ok(output.length > 0);
});

test("check-css-drift.mjs が対象・共有セレクタ・乖離の集計を出す", () => {
  const output = execFileSync("node", [cssDriftScript], { cwd: root, encoding: "utf8" });
  assert.match(output, /対象\s*\d+\s*ファイル/);
  assert.match(output, /共有セレクタ\s*\d+\s*件/);
  assert.match(output, /乖離\s*\d+\s*件/);
});

test("ツールまたは提案パックの絞り込み時に束ねカードから指定memberのHTMLを開く", () => {
  const html = readCatalogModel().html;
  assert.ok(html.includes("function selectedMemberForItem"));
  assert.match(html, /item\.group\.members\.find\(m => m\.slug === state\.tool\)/);
  assert.match(html, /const selectedMember = selectedMemberForItem\(s\);/);
  assert.match(html, /const openPath = slidePath\(selectedMember \? selectedMember\.key : canonicalKey\);/);
  assert.ok(html.includes('href="${openPath}" target="_blank"'));
});
