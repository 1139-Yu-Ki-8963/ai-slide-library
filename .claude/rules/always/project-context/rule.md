# プロジェクトコンテキスト（PROJECT-CONTEXT）

## 概要

AIツールの解説スライド（横1枚・16:9・自己完結HTML）を公開するカタログサイト。index.html（カタログ）と slides/ 配下の各スライドを GitHub Pages で配信する。スライドの正本はこのリポジトリ（ai-consulting-toolkit の docs/10_解説スライド集 から 2026-07-16 に移管）。

## 技術スタック

- 静的 HTML + ブラウザ内 JavaScript（フレームワーク・ビルド依存なし）
- カタログ生成: Node.js スクリプト（`scripts/build-catalog.mjs`、依存パッケージなし）
- 配信: GitHub Pages（main ブランチ直下）

## 運用ルール

- スライドのメタデータの正本は `docs/スライド蓄積簿.md` の表。index.html のデータ部は手編集せず、`node scripts/build-catalog.mjs` で再生成する
- 公開リポジトリのため、特定環境の絶対パス・特定顧客の情報を含めない
- ローカルプレビュー: `python3 -m http.server 8301`（ポート規約: ベース 8300 + frontend +1）

## 設定索引

- `.claude/rules/always/project-context/flow-values.yml` — 実装フロー設定値（orchestrating-dev-flow が参照）

## ルート直下許可ディレクトリ

| ディレクトリ名 | 用途 |
|---|---|
| slides | スライド実体（1スライド = 1フォルダ） |
| scripts | カタログ生成スクリプト |
| docs | スライド蓄積簿 |
