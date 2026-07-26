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

## スライドデザイン仕様の必読

- HTMLスライドの新規作成・更新・型登録では、作業開始前にグローバルスキル同梱の `~/agent-home/skills/generating-explanation-html-slides/references/slide-design-system.md` を読む
- 共通シェル（背景、コンテンツ面、基本色、フォント方向性、余白、ヘッダー・フッターの骨格）は、スライドごとのCSSへ重複実装しない
- 会社別の差分はテーマ変数・共通パーツへ集約し、型固有CSSは本文の図表・情報構造に限定する
- 仕様書はプロジェクト固有の正本であり、グローバルルール・グローバルスキルを変更して代替しない

## 設定索引

- `.claude/rules/always/project-context/flow-values.yml` — 実装フロー設定値（orchestrating-dev-flow が参照）

## ルート直下許可ディレクトリ

| ディレクトリ名 | 用途 |
|---|---|
| slides | スライド実体（1スライド = 1フォルダ） |
| scripts | カタログ生成スクリプト |
| docs | スライド蓄積簿 |
