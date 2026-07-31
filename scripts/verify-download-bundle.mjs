#!/usr/bin/env node
// カタログの単体HTMLダウンロード機能を実描画で検査する。playwright が必要（devDependencies に登録済み）。
import { readFile, mkdtemp, rm, cp } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, extname, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "127.0.0.1";
const PORT = 8301;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
};

function mimeFor(filePath) {
  return MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream";
}

function resolveRequestPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const full = resolve(REPO_ROOT, relative);
  if (full !== REPO_ROOT && !full.startsWith(REPO_ROOT + sep)) return null;
  return full;
}

function startServer() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url, `http://${HOST}:${PORT}`);
        const filePath = resolveRequestPath(url.pathname);
        if (!filePath) {
          res.writeHead(403);
          res.end("forbidden");
          return;
        }
        const body = await readFile(filePath);
        res.writeHead(200, { "content-type": mimeFor(filePath) });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end("not found");
      }
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(
          `検査サーバーの起動に失敗しました: ポート ${PORT} は使用中です。\n` +
          "原因: README がローカルプレビューに案内しているポート番号（8301）と同じであり、" +
          "プレビューを起動したまま検査を走らせるとbindに失敗します。\n" +
          "対処: 起動中のプレビュー（python3 -m http.server 8301 等）を止めてから再実行してください。"
        );
        process.exit(1);
      } else {
        reject(err);
      }
    });
    server.listen(PORT, HOST, () => resolvePromise(server));
  });
}

async function main() {
  const { chromium } = await import("playwright");
  const server = await startServer();
  let browser = null;
  const tmpDirs = [];
  const failures = [];

  function fail(name, actual) {
    failures.push({ name, actual });
  }

  try {
    browser = await chromium.launch();

    // --- 本検査: ダウンロードされたHTMLが単体で成立するか ---
    const page = await browser.newPage();
    await page.goto(`http://${HOST}:${PORT}/`);
    const downloadLink = page.locator("[data-slide-download]").first();
    await downloadLink.waitFor({ state: "visible" });

    const downloadDir = await mkdtemp(join(tmpdir(), "verify-download-bundle-"));
    tmpDirs.push(downloadDir);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadLink.click(),
    ]);
    const savedPath = join(downloadDir, await download.suggestedFilename());
    await download.saveAs(savedPath);
    const savedHtml = await readFile(savedPath, "utf8");

    if (savedHtml.includes("../../assets/")) {
      fail("保存ファイルに共有アセットへの相対参照が残っていないこと", "参照が残っている");
    }
    if (!savedHtml.includes("<style data-shared-slide-shell>")) {
      fail("共有スタイルが埋め込まれていること", "<style data-shared-slide-shell> が見つからない");
    }
    if (!savedHtml.includes("<script data-shared-slide-shell-script>")) {
      fail("共有スクリプトが埋め込まれていること", "<script data-shared-slide-shell-script> が見つからない");
    }
    await page.close();

    const savedPage = await browser.newPage();
    await savedPage.goto(pathToFileURL(savedPath).href);
    try {
      await savedPage.waitForFunction(
        () => document.documentElement.dataset.sharedSlideShellReady === "true",
        { timeout: 10000 }
      );
    } catch {
      const actual = await savedPage.evaluate(
        () => document.documentElement.dataset.sharedSlideShellReady || "(未設定)"
      );
      fail("共有スクリプトが実行され sharedSlideShellReady が true になること", actual);
    }

    const footerCount = await savedPage.locator("[data-shared-slide-footer]").count();
    if (footerCount < 1) {
      fail("共有スクリプトが生成する [data-shared-slide-footer] が1件以上存在すること", `${footerCount}件`);
    }

    const slideScale = await savedPage.evaluate(
      () => document.documentElement.style.getPropertyValue("--slide-scale")
    );
    if (!slideScale) {
      fail("--slide-scale が設定されていること", "空文字");
    }

    const slideBackground = await savedPage.evaluate(() => {
      const slide = document.querySelector(".slide");
      return slide ? getComputedStyle(slide).backgroundColor : null;
    });
    if (!slideBackground || slideBackground === "rgba(0, 0, 0, 0)" || slideBackground === "transparent") {
      fail("スライド面（.slide）の背景色が共有スタイルで設定されていること", slideBackground || "(要素が見つからない)");
    }
    await savedPage.close();

    // --- 対照検査: 埋め込みを行わない元HTMLでは成立しないことを確認する ---
    const slidesDir = join(REPO_ROOT, "slides");
    const sampleKey = readdirSync(slidesDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .find(name => existsSync(join(slidesDir, name, "解説スライド.html")));
    if (!sampleKey) {
      fail("対照検査用のスライドHTMLが1件以上存在すること", "slides/ 配下に解説スライド.html を持つディレクトリが見つからない");
    } else {
      const controlDir = await mkdtemp(join(tmpdir(), "verify-download-bundle-control-"));
      tmpDirs.push(controlDir);
      const controlPath = join(controlDir, "解説スライド.html");
      await cp(join(slidesDir, sampleKey, "解説スライド.html"), controlPath);
      const controlPage = await browser.newPage();
      await controlPage.goto(pathToFileURL(controlPath).href);
      let controlReady = "(未設定)";
      try {
        await controlPage.waitForFunction(
          () => document.documentElement.dataset.sharedSlideShellReady === "true",
          { timeout: 3000 }
        );
        controlReady = "true";
      } catch {
        controlReady = await controlPage.evaluate(
          () => document.documentElement.dataset.sharedSlideShellReady || "(未設定)"
        );
      }
      if (controlReady === "true") {
        fail(
          "対照検査: 共有シェルを埋め込まない元HTMLでは sharedSlideShellReady が true にならないこと（検査が実際に失敗を検出できることの証明）",
          "true になってしまった"
        );
      }
      await controlPage.close();
    }
  } finally {
    if (browser) await browser.close();
    await new Promise((resolvePromise) => server.close(resolvePromise));
    for (const dir of tmpDirs) {
      await rm(dir, { recursive: true, force: true });
    }
  }

  if (failures.length > 0) {
    console.error("検査失敗:");
    for (const f of failures) {
      console.error(`- ${f.name}: 実測値=${f.actual}`);
    }
    process.exit(1);
  }

  console.log(JSON.stringify({ result: "pass", checks: 8 }, null, 2));
  process.exit(0);
}

main();
