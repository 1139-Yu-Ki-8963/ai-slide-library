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
- 公開承認がない限り、Phase 15のcommit・push・公開へ進まないこと

## Phase 7: 機械検証

生成・更新された全対象と、既存カタログ全件を対象に、グローバルSkill配下の検証スクリプトを実行する。

実行:

```bash
SLIDE_VERIFY_REGISTRY=0 SLIDE_VERIFY_CATALOG=0 npm test
```

検査内容:

- 全スライドの共有CSS内包ブロックが1つで、正本と完全一致すること
- タイトル・フッターのcomputed値が共通契約と一致すること
- 1280×720のスライドサイズ、ヘッダー・タイトル・フッターの内包
- desktop/mobileのoverflow、欠落、JavaScriptエラー
- 640×360サムネイルのPNG寸法と内容
- 新規追加前は台帳・カタログ未生成のため、カタログ突合を除外してスライド本体を検証する

Phase 7の検査項目には、グローバルSkillの`verify-slide-static-contract.mjs`による以下も含む。

- `<title>`、未確定トークン、個人環境・セッションパス、外部アセット依存
- 保存済み`サムネイル.png`の640×360寸法
- 既存登録時のスライドキーと蓄積簿・主題一覧の集合一致

完了条件: 追加前は`SLIDE_VERIFY_REGISTRY=0 SLIDE_VERIFY_CATALOG=0 npm test`でスライド本体3系統を通過し、Phase 14後のPhase 15では環境変数なしの`npm test`で台帳・主題一覧・カタログを含む全件を通過すること。

## Phase 8: 公開成果物の観点レビュー

このSkill自身が、公開前レビューの観点と判定を完結させる。別のレビューSkillは呼び出さない。

グローバルSkillの`references/information-design-review-checklist.md`を全文の正本として読み、以下を順に確認する。ここでは内容を要約して観点を減らしてはならない。

1. レビュー前の内部確認16項目（目的、読み手、役割、結論、階層、図形関係、線の意味、色の意味、グラフ・表の読み方、装飾、保持情報、適用箇所、HTML構造、共通レイアウト、縮小・カタログ認識、関連ファイル）を整理する。
2. 図形、矢印・接続線、文字、配色・アクセシビリティ、視線の流れ、整列、余白を確認する。
3. グラフがある場合はデータの視認性、線の強弱、軸・凡例・単位・目盛・注釈、直接ラベル、比較軸、数値・出典、グラフ種別、誤解を招く軸を確認する。
4. 表がある場合は罫線、行の区別、項目・整数・小数の整列、単位、塗り分け、強調、項目・数値・注釈・出典、HTML`table`構造を確認する。
5. カード乱立、項目ごとの無意味な色分け、大きな矢印、グラデーション、立体図形、無関係な人物イラスト、均等配置だけの構成を確認する。
6. 主張、数値、固有名詞、単位、期間、条件、注釈、出典、凡例、軸、表項目、比較対象、因果関係、前提条件が維持されているかを元資料と照合する。
7. 16:9、縮小、サムネイル、カタログ、編集可能性、配置・命名・台帳整合性・公開安全性を確認する。

各指摘は「対象箇所 / 問題 / 理由 / 必要な修正」で記録し、重大、要修正、改善推奨、問題なし、判断保留に分類する。結果は正本の出力形式（総合判定、重大な問題、要修正の問題、改善推奨、内容保持、表示・実装、ai-slide-library適合性、次のアクション）に従う。ユーザーの明示的な修正依頼がない限り、レビュー中にHTML・CSS・画像・カタログ・サムネイルを変更しない。

単一スライドの図表・情報設計だけを対象にする。デッキ全体レビューはPhase 9、情報過多・分割要否はPhase 10、実務性・非テンプレ感はPhase 11で実施し、ここで再実行しない。複数ページでデッキ文脈がある場合も、Phase 8ではページ単位の図表・情報設計に限定する。

各指摘は共通判定schemaの`severity`（`critical` / `high` / `medium` / `low`）と`decision`（`fail` / `hold` / `pass` / `suggestion`）で記録する。旧来の`P0〜P3`や「重大・要修正」は出力時にこのschemaへ正規化する。

レビューのみでは承認なしにHTML・CSS・画像・カタログを変更しない。

## Phase 9: デッキ全体・アートディレクションレビュー


対象観点:

- タイトル・ヘッダー・フッターの統一性
- 余白、文字サイズ、視線誘導、情報密度
- 図表の読み順、軸・凡例・単位・数値の整合性
- 既存スライド更新時の情報欠落0件
- 指示された変更の反映漏れ0件
- AI生成物に見える不自然なカード乱立、装飾過多、曖昧な主張の有無
- 公開HTMLに個人名、顧客名、端末固有情報、絶対パスがないこと

レビューはPlaywrightで1280×720の実描画を取得し、`slides/<スライドキー>/evidence/検証用スクリーンショット.png`へ保存する。対象スライドを観点表に1行ずつ記録する。判定は共通schemaの`decision`で記録し、`fail`または`hold`が1件でもあれば公開不可とする。

完了条件: 全観点PASS、検査記録、レビュー用スクリーンショットが保存されていること。

完了条件: 対象範囲、デッキ全体評価、各ページ評価、共通schemaの指摘、最終判定が検査記録へ保存されていること。単一スライドでデッキ文脈がない場合は適用対象なしを記録する。

## Phase 10: 既存デッキの情報過多・分割要否レビュー

複数の既存HTMLスライドを資料全体として確認する。グローバルSkillの`references/existing-deck-split-review.md`を全文の正本として読み、ユーザーが指定したファイル・ディレクトリだけを対象にする。Phase 9のアートディレクションレビューとは統合しない。単一スライドでデッキ文脈がない場合は適用対象なしと記録する。

レビューでは、対象・HTML構造・実描画・サムネイル・検査記録・関連プロンプト・前後関係を確認し、資料全体の主張、読み手の判断、ページ順、1ページ1メッセージ、主張と根拠、重複・欠落・順序を判定する。各スライドの仮主題、情報構造、図解候補、別ページへ移す情報、不要情報を記録する。

特に、現状・原因・解決策・実施方法・効果・費用の混在、表・工程・体制・数値・関係図の同居、主要数値と根拠の過多、小さな文字への押し込みを検出する。分割・統合・移動の提案は、主張、根拠、数値、単位、条件、出典、因果関係を保持する前提で作成する。一覧・台帳・定義・体制・付録など網羅性が価値のページは、単純な削減対象にしない。

判定は共通schemaの`severity`と`decision`で記録する。`critical`または`fail`・`hold`が1件でもあれば公開不可とする。指摘は対象ファイル、スライドキー、対象箇所、問題、根拠、影響、必要な修正、修正後の確認方法で検査記録へ保存する。レビューのみではHTML・CSS・画像・台帳・カタログを変更しない。

完了条件: 分割・統合・移動の要否、保持必須情報、優先順位、最終判定が記録され、対象範囲が明示されていること。単一スライドは適用対象なしの記録で可。

## Phase 11: 実務性・非テンプレ感レビュー

既存スライドがテンプレートへ情報を流し込んだだけでなく、実務で使用できる編集済み資料になっているかを確認する。グローバルSkillの`references/practical-slide-editorial-review.md`を全文の正本として読み、Phase 8の図表レビュー、Phase 9のデッキ全体レビュー、Phase 10の分割要否レビューとは統合しない。

主張、情報の主従、読み順、論証、余白、文字組み、配置、視覚的強弱、カード・アイコン・写真・色・フッター・多角形・グラデーションなどのテンプレ表現、会議利用性を判定する。元にない会社名、日付、ロゴ、数値、効果、費用、期間、キャッチコピー、注釈、写真、根拠のない図解を追加しない。

判定は共通schemaの`severity`と`decision`で記録する。14項目の最終チェックを実施し、情報設計の再編集案として主役、支える情報、後景化、レイアウト、読み順、削除・統合・短縮候補、追加禁止情報を検査記録へ保存する。レビューのみではHTML・CSS・画像・台帳・カタログを変更しない。

完了条件: 14項目の最終チェック、指摘、実務利用性の総合判定、修正方針が検査記録へ保存されていること。

## Phase 8〜11の並列実行

Phase 7の機械検証を先行ゲートとし、PASS後にPhase 8〜11を独立したレビュー枝として並列実行する。Phase番号と責務は分けたまま、実行順だけを並列化する。

```text
Phase 7 機械検証
       ├─ Phase 8 単一スライド図表・情報設計
       ├─ Phase 9 デッキ全体・アートディレクション
       ├─ Phase 10 情報過多・分割要否
       └─ Phase 11 実務性・非テンプレ感
                    ↓
       Phase 12 指摘統合・修正・再検証
```

Phase 8〜11は同一のHTML、実描画、サムネイルを読み取り専用で入力し、各枝は他枝の検査記録を書き換えない。各枝は次のJSON契約で`検査記録/phase-<N>.json`を1つだけ返す。

```json
{
  "phase": 8,
  "targetKeys": ["対象キー"],
  "status": "pass|fail|hold",
  "findings": [{"severity": "critical|high|medium|low", "decision": "fail|hold|pass|suggestion", "target": "", "evidence": "", "fix": ""}],
  "checkedAt": "ISO-8601",
  "artifactSha256": "対象HTMLのSHA-256"
}
```

Phase 12だけが4枝のJSON schema・対象キー・HTML成果物SHAを検証して統合記録を書く。`artifactSha256`は対象HTMLのSHA-256とし、PNGは別途寸法・描画検証で保証する。JSONは`slides/<キー>/検査記録/phase-8.json`〜`phase-11.json`に分離し、各枝は読み取り専用で返却する。`fail`、`hold`、`critical`を1件でも含む場合は修正へ送る。修正後はPhase 7へ戻り、機械検証を通過したうえで、変更の影響を受けるレビュー枝を再実行する。公開判定は4枝すべての`status=pass`を要求する。

## Phase 12: 修正・再検証

Phase 8、Phase 9、Phase 10、またはPhase 11で`status=fail`または`status=hold`が出た場合は、生成HTMLを修正し、Phase 7→11を再実行する。AIレビューの修正であっても、必ず機械検証へ戻る。Phase 12は修正前に4枝のJSONをschema検証し、修正後に古いJSONを再利用してはならない。

完了条件: Phase 7〜11が連続してPASSし、修正内容と反復回数を検査記録へ記載していること。

## Phase 13: 登録・蓄積簿更新

1. `slides/<スライドキー>/解説スライド.html`へ配置する。
2. `docs/スライド蓄積簿.md`の語彙一覧と照合し、11列形式で新規行を追加または既存行を更新する。
3. `docs/スライド主題一覧.md`へ主題を追加または更新する。
4. 検査記録へ、機械検証・観点レビュー・修正履歴を保存する。

完了条件: HTML、蓄積簿、主題一覧、検査記録の整合性が確認できること。

## Phase 14: サムネイル・カタログ生成

1. `scripts/build-thumbs.mjs`でサムネイルを生成する。
2. `scripts/build-catalog.mjs`でカタログを再生成する。
3. 枚数、対象キー、タイトル、タグ、主題の埋め込みを確認する。
4. ローカル一覧をPlaywrightで開き、「もっと見る」を全展開して全画像を検証する。

完了条件: サムネイル・カタログ生成成功、全画像ロード成功、一覧表示の機械検証PASS。ここではcommitしない。

## Phase 15: コミット・公開承認ゲート

1. Phase 7〜14のPASS記録、4枝JSON、統合記録を確認する。
2. `npm test`をカタログ生成後の最終状態で実行し、静的検査・契約検査・レイアウト検査・一覧検査を全件PASSさせる。
3. `git diff --check`を実行する。
4. ユーザーの明示的な公開承認を確認する。
5. commit前hookで、機械検証PASS・観点レビュー記録・4枝JSON・証跡の存在・staged HTMLと記録のSHA一致を確認する。
6. 条件未達ならcommitを停止する。commitはこのPhaseで実行し、後続Phaseで生成物を変更しない。

完了条件: 公開承認があり、commit前ゲートがPASSしていること。

## Phase 16: 公開後検証・完了報告

1. Phase 15で確定したcommitについて、`.git/slide-publish-approval.json`の`status=approved`と`approvedCommitSha=HEAD`を作成した後にpushしてGitHub Pagesへ反映する。承認記録がなければhookがpushを停止する。
2. 公開URL、個別HTML、サムネイル、一覧をPlaywrightで検証する。
3. 一覧画像数、`naturalWidth`、表示枠、代表スライドのHTTP 200を確認する。
4. push後のworktreeがcleanで、公開前のcommitと公開物の生成内容が一致することを確認する。
5. 検査結果と公開URLを報告する。

完了条件: 公開物のHTTP・画像ロード・一覧表示がPASSし、worktreeがcleanであること。

## 完了条件

| Phase | 完了条件 |
|---|---|
| Phase 7 | 静的契約・共通契約・レイアウトの3系統が終了コード0 |
| Phase 8 | 公開観点レビュー全行PASS |
| Phase 9 | デッキ全体レビュー全行PASS（単一スライドは適用対象なし） |
| Phase 10 | 情報過多・分割要否レビュー全行PASS |
| Phase 11 | 実務性・非テンプレ感レビュー全行PASS |
| Phase 12 | 修正後にPhase 7〜11を再PASS |
| Phase 13 | HTML・蓄積簿・主題一覧・検査記録が整合 |
| Phase 14 | サムネイル・カタログ・一覧画像がPASS |
| Phase 15 | 最終npm test、明示承認、commit前ゲート、commitがPASS |
| Phase 16 | 公開後Playwright検証とworktree clean |
| **Goal** | 検証済みスライドが公開カタログで提示可能 |

## ループ設計

- 反復条件: Phase 7、8、9、10、または11がFAILしたらPhase 12で指摘を統合し、修正してPhase 7へ戻る
- 上限回数: 5回
- 停止条件: 全PASS、5回到達、同一FAILが2回連続

## 重要な注意事項

- 生成SkillのPhase 1〜6をこのSkillで再実行しない。
- レビュー結果を別Skillの実行済み報告で代用しない。
- 機械検証PASSだけで公開しない。観点レビューPASSも必須。
- 公開承認前にcommit・pushしない。
- `index.html`のカタログデータを手編集しない。

## 予想を裏切る挙動

- サムネイル生成が成功しても、一覧全件表示と画像ロードが失敗することがあるため、Phase 14のPlaywright検証を省略してはならない。
- AIレビューで修正しただけでも、computed値やサムネイルが変わるためPhase 7へ戻る。

## 参照資料

- `~/agent-home/skills/generating-explanation-html-slides/SKILL.md` — Phase 1〜6の生成工程
- `~/agent-home/skills/generating-explanation-html-slides/references/information-design-review-checklist.md` — Phase 8で全文適用する図表・情報設計レビュー正本
- `~/agent-home/skills/generating-explanation-html-slides/references/deck-level-art-direction-review.md` — Phase 9で全文適用するデッキ全体レビュー正本
- `~/agent-home/skills/generating-explanation-html-slides/references/existing-deck-split-review.md` — Phase 10で全文適用する情報過多・分割要否レビュー正本
- `~/agent-home/skills/generating-explanation-html-slides/references/practical-slide-editorial-review.md` — Phase 11で全文適用する実務性・非テンプレ感レビュー正本
- `~/agent-home/skills/generating-explanation-html-slides/scripts/verify-slide-contract.mjs` — 共通契約検証
- `~/agent-home/skills/generating-explanation-html-slides/scripts/verify-slide-static-contract.mjs` — 静的HTML・公開安全・登録整合性・保存済みサムネイル検証
- `~/agent-home/skills/generating-explanation-html-slides/scripts/qa-slide-layout.mjs` — desktop/mobile表示検証
- `docs/スライド蓄積簿.md` — タグ語彙と登録台帳
- `docs/スライド主題一覧.md` — 主題台帳

## 完了報告

`~/agent-home/skills/managing-agent-configs/references/skills/completion-report-format.md`の共通骨格に従い、Phase 7〜15のPASS結果、反復回数、公開URLを報告する。
