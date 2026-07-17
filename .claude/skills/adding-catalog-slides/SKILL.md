---
name: adding-catalog-slides
description: |
  解説スライドを生成し、本カタログへ登録して公開まで完遂する。
  TRIGGER when: 「スライドを追加」「カタログに登録」「スライドを作って載せて」と言われた時。
  SKIP: スライドの閲覧・検索のみの時、カタログ登録を伴わない生成のみの時（→generating-explanation-html-slides）。
invocation: adding-catalog-slides
type: orchestration
allowed-tools: Bash, Read, Write, Edit, Skill, AskUserQuestion
---

# カタログスライド追加（adding-catalog-slides）

ai-slide-library 専用の登録オーケストレーター。スライドの生成・品質検査は共通スキル generating-explanation-html-slides に委譲し、本スキルはこのリポジトリ固有の登録工程（タグ付与・蓄積簿追記・カタログ再生成・公開）を統制する。

## 使用タイミング

- このリポジトリでスライドを新規追加し、公開カタログへ反映する時
- 既存スライドを更新し、蓄積簿・カタログへ追従させる時

## 基本ワークフロー

### Phase 1: 作業ブランチ準備

1. `Skill("parallel-dev-worktree")` で feature ブランチの worktree を作成する（メインツリーの直接編集は hook で block される）
2. 以降の作業はすべて worktree 内で行う

完了条件: worktree 内で `git status` がクリーンであること

### Phase 2: スライド生成（共通スキルへ委譲）

1. `Skill("generating-explanation-html-slides")` を起動し、出力先ディレクトリとして worktree 内の `slides/` を指定する（保存先は `slides/<スライドキー>/解説スライド.html` と同フォルダの `検査記録.md`）
2. 共通スキル側の蓄積簿登録工程（旧5列形式）は実行しない。蓄積簿の列構成は本リポジトリの `docs/スライド蓄積簿.md` の記入規則が正であり、本スキルの Phase 3 が代替する

完了条件: 観点レビュー表の全行 PASS のスライドと検査記録が `slides/<スライドキー>/` に保存され、`evidence/検証用スクリーンショット.png`（1280×720）が同フォルダに保持されていること。独立レビュー（`Skill("reviewing-against-rules")` 経由の document-reviewer 判定）が PASS であること

### Phase 3: タグ付与と蓄積簿追記

1. `docs/スライド蓄積簿.md` の「タグ語彙一覧」を Read し、対象ツール・仕組み・テーマを既存語から選ぶ
2. 既存語で表せない概念がある場合のみ、表記統一基準（技術要素は英語の正式名称・テーマは日本語・1語=1概念）に従って先に語彙一覧へ追加する
3. 「スライド一覧」表へ7列形式（スライドキー / 説明対象 / 提示する課題の例 / 対象ツール / 仕組み / テーマ / 登録日）で1行追記する。複数値は「、」区切り、該当なしの軸は「—」

完了条件: 追記行の全タグが語彙一覧に存在すること

### Phase 4: サムネイル生成・カタログ再生成と検証

1. サムネイルを生成する: プロジェクトルートに playwright を一時リンク（`ln -sfn <playwright-node_modules-path> node_modules`）し、`node scripts/build-thumbs.mjs` を実行する。完了後にリンクを外す（`rm -f node_modules`）。新スライドの `slides/<スライドキー>/サムネイル.png` が生成されたことを確認する
2. `node scripts/build-catalog.mjs` を実行する
3. 成功出力のスライド枚数が追加後の期待枚数と一致すること、index.html に新スライドキーが埋め込まれたこと（grep）を確認する
4. 語彙一覧に無いタグでビルドが停止した場合は Phase 3 に戻り、語彙一覧かタグを修正する

完了条件: サムネイルが生成され、カタログ再生成が成功し、枚数一致と新キーの埋め込みが確認されていること

### Phase 4b: 独立レビューゲート（公開前必須）

Phase 5 に進む前に、`Skill("reviewing-against-rules")` を起動し、`document-reviewer` にスライドの証跡スクリーンショット（`evidence/検証用スクリーンショット.png`）を渡して独立判定させる。document-reviewer は Read でマルチモーダルに PNG を読めるため Playwright は不要。PASS でなければ Phase 2 に戻って修正する。

完了条件: document-reviewer による独立レビューが PASS であること

### Phase 5: 公開

1. commit（命名規約に従う）→ push → PR 作成 → main へマージする
2. GitHub Pages のビルドが対象コミットで built になったことを確認する
3. worktree を片付け、メインツリーを最新化する

完了条件: 公開カタログの更新が確認され、worktree が残っていないこと

## 完了条件

| Phase | 完了条件 |
|---|---|
| Phase 1 | worktree 内で git status がクリーン |
| Phase 2 | 観点レビュー全行 PASS のスライドと検査記録が slides/ 配下に保存済み |
| Phase 3 | 蓄積簿の追記行の全タグが語彙一覧に存在する |
| Phase 4 | サムネイル生成済み・カタログ再生成が成功し、枚数一致と新キー埋め込みを確認済み |
| Phase 5 | main へマージされ Pages のビルドが built |
| **Goal** | 新スライドが公開カタログで検索・提示・ダウンロード可能になっている |

## ループ設計

| 要素 | 内容 |
|---|---|
| 反復条件 | Phase 4 のビルド停止（語彙外タグ・スライド実体不在）を修正して再実行する |
| 上限回数 | 3 回 |
| 停止条件 | 収束停止: ビルド成功 ／ リソース上限: 3 回到達 ／ 発散検知: 同一エラーが 2 回連続 |

上限・発散で停止した場合は残エラーと原因を報告し、ユーザーの判断を仰ぐ。

## 重要な注意事項

- 公開リポジトリのため、特定顧客の情報・特定環境の絶対パスをスライド・蓄積簿・検査記録に入れない
- index.html のデータ部（CATALOG-DATA マーカー間）を手編集しない。変更は必ず蓄積簿 → 再生成の経路で行う
- 語彙一覧の語の削除・改名は既存スライドの再タグ付けを伴うため、スライド追加のついでに行わない

## 予想を裏切る挙動

- 共通スキルの蓄積簿登録（旧5列・リンク列あり）をそのまま使うと本リポジトリの7列形式と不整合になる。Phase 3 で必ず置き換える
- 該当スライドが0枚の語も、語彙一覧に登録するだけでカタログにグレーの選択不可チップとして表示される（準備中の見せ方としてこれが正）
- 語彙外タグでビルドが exit 1 で止まるのは意図した動作（表記ゆれの機械防止）。エラーを回避するために検査を外さない

## 参照資料

- `~/agent-home/skills/generating-explanation-html-slides/SKILL.md` — スライド生成・品質検査の正本（ヒアリング・構造設計・観点レビュー表）
- `docs/スライド蓄積簿.md` — タグ語彙一覧・記入規則・スライド一覧（メタデータの正本）
- `scripts/build-catalog.mjs` — カタログ生成スクリプト（語彙照合・データ埋め込み）
- `README.md` — 公開URL・構成・追加手順の公開向け説明

## 完了報告

`~/agent-home/skills/managing-agent-configs/references/skills/completion-report-format.md` の共通骨格（作業報告型）に従う。固有の検証行: 追加スライドキー・蓄積簿の追記行・カタログ再生成出力（枚数）・公開反映の確認結果。
