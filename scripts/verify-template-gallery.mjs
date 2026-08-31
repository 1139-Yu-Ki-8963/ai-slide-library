#!/usr/bin/env node
// 型ギャラリーの成果物（templates.html・型パック.zip）が台帳と一致し、再生成済みであることを検証する。
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildArtifacts } from "./build-templates.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(name, actual) {
  failures.push({ name, actual });
}

// store（無圧縮）方式の zip から、ローカルファイルヘッダを順に辿ってエントリを取り出す。
// makeZip が生成した形式（データディスクリプタなし・central directory の直前で終端）専用の単純パーサ。
function readZipEntries(buf) {
  const entries = [];
  let pos = 0;
  while (pos + 4 <= buf.length && buf.readUInt32LE(pos) === 0x04034b50) {
    const compSize = buf.readUInt32LE(pos + 18);
    const nameLen = buf.readUInt16LE(pos + 26);
    const extraLen = buf.readUInt16LE(pos + 28);
    const nameStart = pos + 30;
    const name = buf.toString("utf8", nameStart, nameStart + nameLen);
    const dataStart = nameStart + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + compSize);
    entries.push({ name, data });
    pos = dataStart + compSize;
  }
  return entries;
}

const { errors, templates, zips, templatesHtml } = buildArtifacts(root);

if (errors.length > 0) {
  for (const e of errors) fail("台帳のデータ検証", e);
}

if (failures.length === 0) {
  const templatesHtmlPath = join(root, "templates.html");
  if (!existsSync(templatesHtmlPath)) {
    fail("templates.html が存在すること", "ファイルが見つからない");
  } else {
    const onDisk = readFileSync(templatesHtmlPath, "utf8");
    if (onDisk !== templatesHtml) {
      fail(
        "templates.html が台帳から再生成済みであること",
        "内容が一致しません。node scripts/build-templates.mjs を実行して再生成してください"
      );
    }
  }

  for (const [rel, expected] of zips) {
    const zipPath = join(root, rel);
    if (!existsSync(zipPath)) {
      fail(`${rel} が存在すること`, "ファイルが見つからない");
      continue;
    }
    const onDisk = readFileSync(zipPath);
    if (!onDisk.equals(expected)) {
      fail(`${rel} が台帳から再生成済みであること`, "内容が一致しません。node scripts/build-templates.mjs を実行して再生成してください");
      continue;
    }
    const entries = readZipEntries(onDisk);
    const sampleEntry = entries.find(e => e.name === "見本スライド.html");
    const promptEntry = entries.find(e => e.name === "型再現プロンプト.md");
    if (!sampleEntry) {
      fail(`${rel} に 見本スライド.html が含まれること`, "エントリが見つからない");
    } else {
      const html = sampleEntry.data.toString("utf8");
      if (!html.includes("<style data-shared-slide-shell>")) {
        fail(`${rel} の 見本スライド.html に共有スタイルが埋め込まれていること`, "<style data-shared-slide-shell> が見つからない");
      }
      if (html.includes("../../assets/")) {
        fail(`${rel} の 見本スライド.html に共有アセットへの相対参照が残っていないこと`, "参照が残っている");
      }
    }
    if (!promptEntry) {
      fail(`${rel} に 型再現プロンプト.md が含まれること`, "エントリが見つからない");
    } else {
      const prompt = promptEntry.data.toString("utf8");
      if (!prompt.includes("デザイン規約")) {
        fail(`${rel} の 型再現プロンプト.md に「デザイン規約」が含まれること`, "文字列が見つからない");
      }
    }
  }
}

if (failures.length > 0) {
  console.error("検査失敗:");
  for (const f of failures) {
    console.error(`- ${f.name}: 実測値=${f.actual}`);
  }
  process.exit(1);
}

console.log(JSON.stringify({ result: "pass", templates: templates.length }, null, 2));
process.exit(0);
