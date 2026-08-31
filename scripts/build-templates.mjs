#!/usr/bin/env node
// docs/スライド型台帳.md から templates.html のデータ部と型ごとの配布 zip を再生成する。
// 蓄積簿の「型の見本」列と台帳を 1:1 で突合し、不整合はエラーで停止する。
// 依存パッケージなし。実行: node scripts/build-templates.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- CRC32（zip 用） ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// --- store（無圧縮）方式の決定的 zip 生成。日時は 2026-01-01 00:00 固定 ---
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const DOS_TIME = 0;

export function makeZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed to extract
    localHeader.writeUInt16LE(0x0800, 6); // flags: UTF-8 file names
    localHeader.writeUInt16LE(0, 8); // method: store
    localHeader.writeUInt16LE(DOS_TIME, 10);
    localHeader.writeUInt16LE(DOS_DATE, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18); // compressed size
    localHeader.writeUInt32LE(data.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra length
    localParts.push(localHeader, nameBuf, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed to extract
    centralHeader.writeUInt16LE(0x0800, 8); // flags
    centralHeader.writeUInt16LE(0, 10); // method
    centralHeader.writeUInt16LE(DOS_TIME, 12);
    centralHeader.writeUInt16LE(DOS_DATE, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42); // relative offset of local header
    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + data.length;
  }
  const centralDirOffset = offset;
  const centralDirBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // number of this disk
  eocd.writeUInt16LE(0, 6); // disk with start of central directory
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment length
  return Buffer.concat([...localParts, centralDirBuf, eocd]);
}

// --- 共有シェルの埋め込み（index.html の embedSharedShell と同じ規則） ---
const SHELL_LINK_PATTERN = /<link\b[^>]*\bdata-shared-slide-shell\b[^>]*>/;
const SHELL_SCRIPT_PATTERN = /<script\b[^>]*\bdata-shared-slide-shell-script\b[^>]*><\/script>/;
export function embedSharedShell(html, css, js) {
  if (!SHELL_LINK_PATTERN.test(html) || !SHELL_SCRIPT_PATTERN.test(html)) return null;
  if (/<\/style/i.test(css)) return null;
  const safeJs = js.replace(/<\/script/gi, "<\\/script");
  return html
    .replace(SHELL_LINK_PATTERN, () => `<style data-shared-slide-shell>\n${css}\n</style>`)
    .replace(SHELL_SCRIPT_PATTERN, () => `<script data-shared-slide-shell-script>\ndocument.addEventListener("DOMContentLoaded", () => {\n${safeJs}\n});\n</script>`);
}

export function buildArtifacts(rootDir) {
  const errors = [];
  const templates = [];
  const zips = new Map();
  let templatesHtml = null;

  const templateLedgerPath = join(rootDir, "docs", "スライド型台帳.md");
  const stockLedgerPath = join(rootDir, "docs", "スライド蓄積簿.md");

  // --- 1) 型台帳の「## 型一覧」節を読み取る ---
  const templateRows = []; // [{ name, structure, fits, sampleKey }]
  if (!existsSync(templateLedgerPath)) {
    errors.push("docs/スライド型台帳.md が存在しません");
  } else {
    const doc = readFileSync(templateLedgerPath, "utf8");
    const section = doc.split(/^## 型一覧$/m)[1]?.split(/^## /m)[0];
    if (!section) {
      errors.push("エラー: docs/スライド型台帳.md に「## 型一覧」節がありません");
    } else {
      const seenNames = new Set();
      for (const line of section.split("\n")) {
        const cells = line.split("|").map(c => c.trim());
        if (cells.length !== 6 || !cells[1]) continue;
        const [, name, structure, fits, sampleKey] = cells;
        if (name === "型名" || /^-+$/.test(name)) continue;
        if (seenNames.has(name)) {
          errors.push(`${name}: 台帳内で型名が重複しています`);
          continue;
        }
        seenNames.add(name);
        templateRows.push({ name, structure, fits, sampleKey });
      }
    }
  }

  // --- 2) 蓄積簿の「## スライド一覧」節から key→型の見本 のマップを作る ---
  const keyToTemplate = new Map();
  if (!existsSync(stockLedgerPath)) {
    errors.push("docs/スライド蓄積簿.md が存在しません");
  } else {
    const doc = readFileSync(stockLedgerPath, "utf8");
    const section = doc.split(/^## スライド一覧$/m)[1];
    if (!section) {
      errors.push("エラー: docs/スライド蓄積簿.md に「## スライド一覧」節がありません");
    } else {
      for (const line of section.split("\n")) {
        const cells = line.split("|").map(c => c.trim());
        // 表行は build-catalog.mjs と同じ 14 要素セル
        if (cells.length !== 14 || !cells[1]) continue;
        const key = cells[1];
        const template = cells[11];
        if (key === "スライドキー" || /^-+$/.test(key)) continue;
        keyToTemplate.set(key, template);
      }
    }
  }

  // --- 3) 突合 ---
  const templateNames = new Set(templateRows.map(t => t.name));
  for (const [key, template] of keyToTemplate) {
    if (template && template !== "—" && !templateNames.has(template)) {
      errors.push(`${key}: 型「${template}」が docs/スライド型台帳.md に未登録です`);
    }
  }
  for (const t of templateRows) {
    const matchingKeys = [...keyToTemplate.entries()]
      .filter(([, tpl]) => tpl === t.name)
      .map(([key]) => key);
    if (matchingKeys.length === 0) {
      errors.push(`${t.name}: 蓄積簿に見本行がありません`);
      continue;
    }
    if (matchingKeys.length >= 2) {
      errors.push(`${t.name}: 見本が複数あります（${matchingKeys.join("、")}）`);
      continue;
    }
    const [ledgerKey] = matchingKeys;
    if (ledgerKey !== t.sampleKey) {
      errors.push(`${t.name}: 台帳の見本スライドキー「${t.sampleKey}」と蓄積簿の見本「${ledgerKey}」が一致しません`);
    }
  }

  // --- 5) 共有シェル素材の読み取り ---
  const cssPath = join(rootDir, "assets", "shared-slide-shell.css");
  const jsPath = join(rootDir, "assets", "shared-slide-shell.js");
  const css = existsSync(cssPath) ? readFileSync(cssPath, "utf8") : null;
  const js = existsSync(jsPath) ? readFileSync(jsPath, "utf8") : null;
  if (css === null) errors.push("assets/shared-slide-shell.css が存在しません");
  if (js === null) errors.push("assets/shared-slide-shell.js が存在しません");

  // --- 4)〜7) 台帳の各行についてファイル実在確認・zip 組み立て・templates 収集 ---
  for (const t of templateRows) {
    const key = t.sampleKey;
    const htmlPath = join(rootDir, "slides", key, "解説スライド.html");
    const thumbPath = join(rootDir, "slides", key, "サムネイル.png");
    const promptPath = join(rootDir, "slides", key, "型再現プロンプト.md");
    let ok = true;
    if (!existsSync(htmlPath)) {
      errors.push(`${key}: slides/${key}/解説スライド.html が存在しません`);
      ok = false;
    }
    if (!existsSync(thumbPath)) {
      errors.push(`${key}: slides/${key}/サムネイル.png が存在しません`);
      ok = false;
    }
    if (!existsSync(promptPath)) {
      errors.push(`${key}: slides/${key}/型再現プロンプト.md が存在しません`);
      ok = false;
    }
    if (!ok || css === null || js === null) continue;

    const html = readFileSync(htmlPath, "utf8");
    const promptText = readFileSync(promptPath, "utf8");
    const embedded = embedSharedShell(html, css, js);
    if (embedded === null) {
      errors.push(`${key}: 共有シェルのマーカーが見つからず自己完結 HTML を生成できません`);
      continue;
    }

    const entries = [
      { name: "見本スライド.html", data: Buffer.from(embedded, "utf8") },
      { name: "型再現プロンプト.md", data: Buffer.from(promptText, "utf8") },
    ];
    zips.set(`slides/${key}/型パック.zip`, makeZip(entries));

    const titleMatch = embedded.match(/<title>([^<]*)<\/title>/);
    const sampleTitle = titleMatch?.[1]?.trim() || key;
    templates.push({
      name: t.name,
      structure: t.structure,
      fits: t.fits,
      sampleKey: key,
      sampleTitle,
    });
  }

  // --- 8) templates.html のマーカー置換 ---
  const templatesHtmlPath = join(rootDir, "templates.html");
  if (!existsSync(templatesHtmlPath)) {
    errors.push("templates.html が存在しません");
  } else {
    const current = readFileSync(templatesHtmlPath, "utf8");
    const marker = /\/\*TEMPLATE-DATA-START\*\/[\s\S]*?\/\*TEMPLATE-DATA-END\*\//;
    if (!marker.test(current)) {
      errors.push("エラー: templates.html に TEMPLATE-DATA マーカーがありません");
    } else {
      const dataBlock =
        "/*TEMPLATE-DATA-START*/\n" +
        `const TEMPLATES = ${JSON.stringify(templates, null, 2)};\n` +
        "/*TEMPLATE-DATA-END*/";
      templatesHtml = current.replace(marker, dataBlock);
    }
  }

  return { errors, templates, zips, templatesHtml };
}

// --- main（直接実行時のみ書き込む） ---
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { errors, templates, zips, templatesHtml } = buildArtifacts(root);
  if (errors.length > 0) {
    console.error("エラー: 型台帳のデータ検証に失敗しました。");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  for (const [rel, buf] of zips) writeFileSync(join(root, rel), buf);
  writeFileSync(join(root, "templates.html"), templatesHtml);
  console.log(`templates.html を再生成しました（型 ${templates.length} 件・zip ${zips.size} 件）`);
}
