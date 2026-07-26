---
name: adding-catalog-slides
description: |
  解説スライドを登録し、検証・カタログ化・公開まで完遂する。
  TRIGGER when: 「スライドを追加」「カタログに登録」「スライドを作って載せて」と言われた時。既存スライドの内容・タイトル・タグを変更した時。
  SKIP: スライドの閲覧・検索のみの時、カタログ登録を伴わない生成のみの時。
invocation: adding-catalog-slides
type: orchestration
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion
---

# カタログスライド追加（adding-catalog-slides）

`generating-explanation-html-slides`が完了したHTMLを受け取り、Phase 7から開始して、検証・登録・公開までを完結させる。このSkillは公開成果物の品質ゲートを所有し、別のレビューSkillへ品質判定を委譲しない。

## 使用タイミング

- `ai-slide-library`でスライドを新規追加・更新し、公開カタログへ反映する時
- タイトル、本文、タグ、共有CSS、サムネイルを変更した時

## 前提

- 生成工程は `generating-explanation-html-slides` のPhase 1〜6を完了していること
- 生成Skillの成果物は単一HTMLで、型・スライドキー・内容が確定していること
- 公開承認がない限り、Phase 12のcommit・push・公開へ進まないこと

## Phase 7: 機械検証

生成・更新された全対象と、既存カタログ全件を対象に、グローバルSkill配下の検証スクリプトを実行する。

実行:

```bash
npm test
```

検査内容:

- 全スライドの共有CSS内包ブロックが1つで、正本と完全一致すること
- タイトル・フッターのcomputed値が共通契約と一致すること
- 1280×720のスライドサイズ、ヘッダー・タイトル・フッターの内包
- desktop/mobileのoverflow、欠落、JavaScriptエラー
- 640×360サムネイルのPNG寸法と内容
- カタログの全件展開、画像ロード、表示幅

完了条件: `test:slide-contract` と `test:slide-layout` がともに終了コード0であること。

## Phase 8: 公開成果物の観点レビュー

このSkill自身が、公開前レビューの観点と判定を完結させる。別のレビューSkillは呼び出さない。

対象観点:

- タイトル・ヘッダー・フッターの統一性
- 余白、文字サイズ、視線誘導、情報密度
- 図表の読み順、軸・凡例・単位・数値の整合性
- 既存スライド更新時の情報欠落0件
- 指示された変更の反映漏れ0件
- AI生成物に見える不自然なカード乱立、装飾過多、曖昧な主張の有無
- 公開HTMLに個人名、顧客名、端末固有情報、絶対パスがないこと

レビューはPlaywrightで1280×720の実描画を取得し、`slides/<スライドキー>/evidence/検証用スクリーンショット.png`へ保存する。対象スライドを観点表に1行ずつ記録する。判定は`PASS / FAIL / 保留`で記録し、FAILまたは保留が1件でもあれば公開不可とする。

完了条件: 全観点PASS、検査記録、レビュー用スクリーンショットが保存されていること。

## Phase 9: 修正・再検証

Phase 8でFAILが出た場合は、生成HTMLを修正し、Phase 7→8を再実行する。AIレビューの修正であっても、必ず機械検証へ戻る。

完了条件: Phase 7とPhase 8が連続してPASSし、修正内容と反復回数を検査記録へ記載していること。

## Phase 10: 登録・蓄積簿更新

1. `slides/<スライドキー>/解説スライド.html`へ配置する。
2. `docs/スライド蓄積簿.md`の語彙一覧と照合し、11列形式で新規行を追加または既存行を更新する。
3. `docs/スライド主題一覧.md`へ主題を追加または更新する。
4. 検査記録へ、機械検証・観点レビュー・修正履歴を保存する。

完了条件: HTML、蓄積簿、主題一覧、検査記録の整合性が確認できること。

## Phase 11: サムネイル・カタログ生成

1. `scripts/build-thumbs.mjs`でサムネイルを生成する。
2. `scripts/build-catalog.mjs`でカタログを再生成する。
3. 枚数、対象キー、タイトル、タグ、主題の埋め込みを確認する。
4. ローカル一覧をPlaywrightで開き、「もっと見る」を全展開して全画像を検証する。

完了条件: サムネイル・カタログ生成成功、全画像ロード成功、一覧表示の機械検証PASS。

## Phase 12: コミット・公開承認ゲート

1. Phase 7〜11のPASS記録を確認する。
2. `git diff --check`を実行する。
3. ユーザーの明示的な公開承認を確認する。
4. commit前hookで、機械検証PASS・観点レビュー記録・証跡の存在を確認する。
5. 条件未達ならcommitを停止する。

完了条件: 公開承認があり、commit前ゲートがPASSしていること。

## Phase 13: 公開後検証・完了報告

1. commit後にカタログを再生成し、更新日時を反映する。
2. pushしてGitHub Pagesへ反映する。
3. 公開URL、個別HTML、サムネイル、一覧をPlaywrightで検証する。
4. 一覧画像数、`naturalWidth`、表示枠、代表スライドのHTTP 200を確認する。
5. 検査結果と公開URLを報告する。

完了条件: 公開物のHTTP・画像ロード・一覧表示がPASSし、worktreeがcleanであること。

## 完了条件

| Phase | 完了条件 |
|---|---|
| Phase 7 | 機械検証2系統が終了コード0 |
| Phase 8 | 公開観点レビュー全行PASS |
| Phase 9 | 修正後にPhase 7・8を再PASS |
| Phase 10 | HTML・蓄積簿・主題一覧・検査記録が整合 |
| Phase 11 | サムネイル・カタログ・一覧画像がPASS |
| Phase 12 | 明示承認とcommit前ゲートがPASS |
| Phase 13 | 公開後Playwright検証とworktree clean |
| **Goal** | 検証済みスライドが公開カタログで提示可能 |

## ループ設計

- 反復条件: Phase 7または8がFAILしたら修正してPhase 7へ戻る
- 上限回数: 5回
- 停止条件: 全PASS、5回到達、同一FAILが2回連続

## 重要な注意事項

- 生成SkillのPhase 1〜6をこのSkillで再実行しない。
- レビュー結果を別Skillの実行済み報告で代用しない。
- 機械検証PASSだけで公開しない。観点レビューPASSも必須。
- 公開承認前にcommit・pushしない。
- `index.html`のカタログデータを手編集しない。

## 予想を裏切る挙動

- サムネイル生成が成功しても、一覧全件表示と画像ロードが失敗することがあるため、Phase 11のPlaywright検証を省略してはならない。
- AIレビューで修正しただけでも、computed値やサムネイルが変わるためPhase 7へ戻る。

## 参照資料

- `~/agent-home/skills/generating-explanation-html-slides/SKILL.md` — Phase 1〜6の生成工程
- `~/agent-home/skills/generating-explanation-html-slides/scripts/verify-slide-contract.mjs` — 共通契約検証
- `~/agent-home/skills/generating-explanation-html-slides/scripts/qa-slide-layout.mjs` — desktop/mobile表示検証
- `docs/スライド蓄積簿.md` — タグ語彙と登録台帳
- `docs/スライド主題一覧.md` — 主題台帳

## 完了報告

`~/agent-home/skills/managing-agent-configs/references/skills/completion-report-format.md`の共通骨格に従い、Phase 7〜13のPASS結果、反復回数、公開URLを報告する。
