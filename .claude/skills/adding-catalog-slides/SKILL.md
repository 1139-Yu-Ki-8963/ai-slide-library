---
name: adding-catalog-slides
description: |
  解説スライドを登録し、検証・カタログ化・公開まで完遂する。
  TRIGGER when: 「スライドを追加」「カタログに登録」「スライドを作って載せて」と言われた時。既存スライドのHTML・内容・タイトル・副題・タグ・共有CSS・サムネイルを変更または再生成した時。
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

- HTML、タイトル、副題、本文、図表、共有CSSを新規作成・変更した場合は、`generating-explanation-html-slides` のPhase 1〜6を完了していること
- タグ・台帳だけの変更、またはHTMLを変更しないサムネイル再生成は生成工程を適用対象外とし、このSkillのPhase 7から開始する
- 生成Skillの成果物はリポジトリ内の単一共有CSSを直接参照するHTMLで、型・スライドキー・内容が確定していること
- Phase 15のcommit完了前に、スライド画像、一覧画像、HTML、レビュー結果をユーザー向けの最終成果物として提示しないこと
- 公開承認がない限り、Phase 17のpush・公開へ進まないこと

## Phase 7: 機械検証

### Step 7-1: HTML共通・スライド固有の機械検証

生成・更新された全対象と、既存カタログ全件を対象に、グローバルSkill配下の検証スクリプトを実行する。

各対象HTMLについて、次のHTML共通検証も実行し、JSON証跡を保存する。

1. `sync-html-rule-copies.mjs`
2. `verify-html-static.mjs <対象HTML>`
3. `verify-html-runtime.mjs <対象HTML>`
4. `verify-html-review-contract.mjs`

いずれかが未実装、未実行、証跡なし、終了コード非0ならPhase 7を`blocked`とし、Phase 8以降へ進まない。HTML、タイトル、副題、本文、図表、共有CSSの修正が必要なら`generating-explanation-html-slides` Phase 2へ戻し、生成Skill Phase 4のレビューを経てPhase 7を再実行する。検査スクリプトまたは登録情報の不備は、その所有箇所で解消してPhase 7を再実行する。Phase 7のFAILをPhase 12へ送らない。共通AIレビュー後の集約はPhase 12で対象HTMLごとに`aggregate-html-review.mjs`を実行する。

実行:

```bash
SLIDE_VERIFY_REGISTRY=0 SLIDE_VERIFY_CATALOG=0 npm test
```

検査内容:

- `pretest`でグローバル正本CSS・JavaScriptを`assets/shared-slide-shell.css`・`assets/shared-slide-shell.js`へ同期し、全HTMLの参照を各1回へ統一する
- `verify-slide-shell-completeness.mjs`で、全HTML・全論理ページ・全外枠候補を母集団化し、共有/許可済み本文/禁止の未分類0件、正本とのbyte一致、規約・criterion・正常fixture・単独違反fixture・実行経路の1対1対応を検査する
- `test-slide-shell-completeness.mjs`で全機械criterionを1件ずつ単独破壊し、mutation survivor 0件を確認する
- `verify-slide-shell-runtime.mjs`で、共有フッター・共有ページ送り・現在/総数・前後ボタン・左右キーを全ページ状態で実操作し、全遷移とcomputed styleを検査する
- `verify-slide-rule-enforcement.mjs`で、ヘッダー規約1件・criterion 1件・checker・正常/違反fixture・証跡・公開ゲートの完全対応を検査する
- `verify-slide-header-contract.mjs`で、HTMLファイル数・DOMヘッダー数とは独立に全論理ページ状態を検出して母数にし、共有ヘッダーも各状態で再検査する。DOM、文字数、改行、実描画行数、文字列内包、座標、computed style、子要素、疑似要素、inline style、`!important`、指定フォントとFontFaceの利用可能性を正本と比較する
- 全スライドが`assets/shared-slide-shell.css`を1つだけ直接参照し、共有CSSのインライン複製が0件で、公開用CSSがグローバル正本と完全一致すること
- タイトル40文字以内、副題70文字以内、両方に強制改行がなく、実描画1行かつ文字列描画矩形がスライド内に収まること
- タイトル・副題・フッターのcomputed値が共通契約と一致すること
- 1280×720のスライドサイズ、ヘッダー・タイトル・フッターの内包
- desktop/mobileのoverflow、全体縮小、欠落、JavaScriptエラー
- 640×360サムネイルのPNG寸法、白紙率、内容
- 新規追加前は台帳・カタログ未生成のため、カタログ突合を除外してスライド本体を検証する

Phase 7の検査項目には、グローバルSkillの`verify-slide-static-contract.mjs`による以下も含む。

- `<title>`、未確定トークン、個人環境・セッションパス、外部アセット依存
- 保存済み`サムネイル.png`の640×360寸法
- 既存登録時のスライドキーと蓄積簿・主題一覧の集合一致

完了条件: 追加前は`SLIDE_VERIFY_REGISTRY=0 SLIDE_VERIFY_CATALOG=0 npm test`でスライド本体3系統と全論理ページ状態のヘッダー契約を通過し、Phase 14後のPhase 15では環境変数なしの`npm test`で台帳・主題一覧・カタログを含む全件を通過すること。ヘッダー契約は、独立検出した論理ページ状態数と検査済みページ状態数の一致、各状態に対応するヘッダーの存在を必須とする。

## Phase 8: 公開成果物の観点レビュー

### Step 8-1: 単一スライドの図表・情報設計レビュー

このSkill自身が、公開前レビューの観点と判定を完結させる。別のレビューSkillは呼び出さない。

グローバルの配布コピー`reviewing-explanatory-html/references/rules/html-editorial-quality.md`と`html-visual-explanation.md`、スライド差分`generating-explanation-html-slides/references/rules/html-slide.md`、および`information-design-review-checklist.md`を全文で読む。このSkill自身が`artifact-review`相当の内容・表示・実装・安全性を判定し、別のレビューSkillは呼ばない。要約して観点を減らしてはならない。

1. レビュー前の内部確認16項目（目的、読み手、役割、結論、階層、図形関係、線の意味、色の意味、グラフ・表の読み方、装飾、保持情報、適用箇所、HTML構造、共通レイアウト、縮小・カタログ認識、関連ファイル）を整理する。
2. 図形、矢印・接続線、文字、配色・アクセシビリティ、視線の流れ、整列、余白を確認する。
3. グラフがある場合はデータの視認性、線の強弱、軸・凡例・単位・目盛・注釈、直接ラベル、比較軸、数値・出典、グラフ種別、誤解を招く軸を確認する。
4. 表がある場合は罫線、行の区別、項目・整数・小数の整列、単位、塗り分け、強調、項目・数値・注釈・出典、HTML`table`構造を確認する。
5. カード乱立、項目ごとの無意味な色分け、大きな矢印、グラデーション、立体図形、無関係な人物イラスト、均等配置だけの構成を確認する。
6. 主張、数値、固有名詞、単位、期間、条件、注釈、出典、凡例、軸、表項目、比較対象、因果関係、前提条件が維持されているかを元資料と照合する。
7. 16:9、縮小、サムネイル、カタログ、編集可能性、配置・命名・台帳整合性・公開安全性を確認する。
8. タイトルが主張または判断対象を示し、副題が範囲・前提・比較軸・根拠・読み方を補っているか、相互の重複と本文への押し込みがないかを確認する。文字数・行数の機械PASSだけで意味品質をPASSにしない。

各指摘は「対象箇所 / 問題 / 理由 / 影響 / 必要な修正 / 修正後確認」で記録する。結果は対象、要約、良い点、指摘事項、情報設計の再編集案、観点別チェック、実装可能な優先順位付き修正方針、ai-slide-library適合性、次のアクションを持つ。ユーザーの明示的な修正依頼がない限り、レビュー中にHTML・CSS・画像・カタログ・サムネイルを変更しない。

HTML共通12 criteriaの結果は、`reviewing-explanatory-html/references/html-review-record.schema.json`へ完全準拠するAI JSONとして、対象ごとに`slides/<キー>/検査記録/html-common-ai.json`へ保存する。`artifact`は対象HTMLのパス、`artifactSha256`はPhase 7の静的・実描画JSONと同じSHA-256、`checks`は共通12 criteriaを重複・欠落なく1件ずつ持つ。Phase 8固有の図表・情報設計結果は従来どおり`phase-8.json`へ分離し、共通AI JSONの代用にしない。

単一スライドの図表・情報設計だけを対象にする。デッキ全体レビューはPhase 9、情報過多・分割要否はPhase 10、実務性・非テンプレ感はPhase 11で実施し、ここで再実行しない。複数ページでデッキ文脈がある場合も、Phase 8ではページ単位の図表・情報設計に限定する。

各指摘は共通判定schemaの`severity`（`critical` / `high` / `medium` / `low`）と`decision`（`fail` / `hold` / `pass` / `suggestion`）で記録する。旧来の`P0〜P3`や「重大・要修正」は出力時にこのschemaへ正規化する。

レビューのみでは承認なしにHTML・CSS・画像・カタログを変更しない。

## Phase 9: デッキ全体・アートディレクションレビュー

### Step 9-1: デッキ全体の役割・順序・強弱レビュー

グローバルSkillの`references/deck-level-art-direction-review.md`を全文の正本として読み、全観点を適用する。以下の箇条書きは重点項目であり、全文レビューの代用にしない。Phase 8、10、11とは統合しない。

対象観点:

- タイトル・ヘッダー・フッターの統一性
- 余白、文字サイズ、視線誘導、情報密度
- 図表の読み順、軸・凡例・単位・数値の整合性
- 既存スライド更新時の情報欠落0件
- 指示された変更の反映漏れ0件
- AI生成物に見える不自然なカード乱立、装飾過多、曖昧な主張の有無
- 公開HTMLに個人名、顧客名、端末固有情報、絶対パスがないこと

レビューはPlaywrightで1280×720の実描画を取得し、`slides/<スライドキー>/evidence/検証用スクリーンショット.png`へ保存する。対象スライドを観点表に1行ずつ記録する。判定は共通schemaの`decision`で記録し、`fail`または`hold`が1件でもあれば公開不可とする。

完了条件: 対象範囲、デッキ全体評価、各ページ評価、共通schemaの指摘、最終判定、レビュー用スクリーンショットが検査記録へ保存されていること。単一スライドでデッキ文脈がない場合はPhase 9の3 criteriaを根拠付き`not-applicable`、Phase全体を`pass`として記録する。

## Phase 10: 既存スライド・デッキの情報過多・分割要否レビュー

### Step 10-1: 情報過多・分割要否レビュー

既存HTMLスライドを資料全体として確認する。グローバルSkillの`references/existing-deck-split-review.md`を全文の正本として読み、ユーザーが指定したファイル・ディレクトリだけを対象にする。Phase 9のアートディレクションレビューとは統合しない。単一スライドでも、1ページ1メッセージ、情報密度、文字の押し込み、分割・移動の要否を必ず判定する。

レビューでは、対象・HTML構造・実描画・サムネイル・検査記録・関連プロンプト・前後関係を確認し、資料全体の主張、読み手の判断、ページ順、1ページ1メッセージ、主張と根拠、重複・欠落・順序を判定する。各スライドの仮主題、情報構造、図解候補、別ページへ移す情報、不要情報を記録する。

特に、現状・原因・解決策・実施方法・効果・費用の混在、表・工程・体制・数値・関係図の同居、主要数値と根拠の過多、小さな文字への押し込みを検出する。分割・統合・移動の提案は、主張、根拠、数値、単位、条件、出典、因果関係を保持する前提で作成する。一覧・台帳・定義・体制・付録など網羅性が価値のページは、単純な削減対象にしない。

判定は共通schemaの`severity`と`decision`で記録する。`critical`または`fail`・`hold`が1件でもあれば公開不可とする。指摘は対象ファイル、スライドキー、対象箇所、問題、根拠、影響、必要な修正、修正後の確認方法で検査記録へ保存する。レビューのみではHTML・CSS・画像・台帳・カタログを変更しない。

完了条件: 分割・統合・移動の要否、保持必須情報、優先順位、最終判定が記録され、対象範囲が明示されていること。単一スライドも適用対象とし、根拠付きで分割不要と判定した場合のみPASSとする。

## Phase 11: 実務性・非テンプレ感レビュー

### Step 11-1: 実務利用性・非テンプレ感レビュー

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
       Phase 12 指摘統合・生成Skillへの修正委譲
```

Phase 8〜11は同一のHTML、実描画、サムネイルを読み取り専用で入力し、各枝は他枝の検査記録を書き換えない。各枝は次のJSON契約で`検査記録/phase-<N>.json`を1つだけ返す。

ヘッダー共有領域だけの一括変更では、Phase番号と4枝の責務を維持したまま、グローバルSkillの`refresh-header-only-review-evidence.mjs`で影響限定再検証を実行できる。必須入力は、現SHAに対するHTML共通static/runtime全件PASS、全論理ページ状態のヘッダーlinter全件PASS、ヘッダーAI 3 criteria全件PASSまたは根拠付きN/A、HEAD比較による非ヘッダーmarkup・型固有CSS不変、再生成済みサムネイル・1280×720証跡、カタログ一覧画像によるヘッダー・本文境界のAI影響レビューである。AIレビューはheader report SHA、全HTML SHA、一覧画像SHAへ固定する。スクリプトはHEADのPhase 8〜11を正本として差分影響だけを現SHAへ再発行し、各PhaseのschemaとHTML共通aggregateを再検証する。本文差分、母数不一致、旧SHA、FAIL、証跡未生成を1件でも検出したら停止し、通常のPhase 8〜11レビューへ戻る。この経路でも4つのPhaseを統合・省略してはならない。

```json
{
  "phase": 8,
  "targetKeys": ["対象キー"],
  "status": "pass|fail|hold|blocked",
  "criteria": [
    {"id": "slide-ai-thumbnail-legibility", "status": "pass|fail|hold|not-applicable", "evidence": "判定根拠"},
    {"id": "slide-ai-one-message", "status": "pass|fail|hold|not-applicable", "evidence": "判定根拠"},
    {"id": "slide-ai-title-claim", "status": "pass|fail|hold|not-applicable", "evidence": "判定根拠"},
    {"id": "slide-ai-subtitle-support", "status": "pass|fail|hold|not-applicable", "evidence": "判定根拠"}
  ],
  "findings": [{"severity": "critical|high|medium|low", "decision": "fail|hold|pass|suggestion|not-applicable", "target": "", "evidence": "", "fix": ""}],
  "checkedAt": "ISO-8601",
  "artifactSha256": "対象HTMLのSHA-256"
}
```

Phase 12だけが4枝のJSON schema・対象キー・HTML成果物SHAを検証して統合記録を書く。`artifactSha256`は対象HTMLのSHA-256とし、PNGは別途寸法・描画検証で保証する。JSONは`slides/<キー>/検査記録/phase-8.json`〜`phase-11.json`に分離し、各枝は読み取り専用で返却する。加えて、Phase 7の`html-common-static.json`と`html-common-runtime.json`、Phase 8の`html-common-ai.json`を対象ごとに`aggregate-html-review.mjs`へ渡す。`blocked`、`fail`、`hold`、`critical`を1件でも含む場合は公開・commit不可とする。HTML、タイトル、副題、本文、図表、共有CSSの修正はこのSkill内で行わず、要件変更を伴う場合は`generating-explanation-html-slides` Phase 1、伴わない場合はPhase 2へ指摘を引き渡す。生成SkillのPhase 1〜6完了後、このSkillのPhase 7〜11をすべて再実行する。公開判定はHTML共通集約`overall=pass`かつ4枝すべての`status=pass`を要求する。

Phase別criteriaは次の完全一致契約とし、重複・欠落・空の`evidence`を許可しない。

- Phase 8: `slide-ai-thumbnail-legibility`、`slide-ai-one-message`、`slide-ai-title-claim`、`slide-ai-subtitle-support`
- Phase 9: `deck-ai-role-sequence`、`deck-ai-strength-rhythm`、`deck-ai-layout-repetition`
- Phase 10: `deck-ai-split-plan`
- Phase 11: スライド差分criteriaは空配列。実務性・非テンプレ感はHTML共通criteriaとPhase 11の`findings`で保持する

`not-applicable`はcriteria単位でのみ使用し、対象外の理由を`evidence`へ記録する。Phase全体の`status`は`pass`とする。Phase 9はデッキ文脈がない単一スライドに限りこの扱いを許可する。Phase 8、10、11をスライド単位で適用対象外にしてはならない。

対象ごとに次を実行し、終了コード0を必須とする。

```bash
node ~/agent-home/skills/generating-explanation-html-slides/scripts/verify-slide-ai-review-contract.mjs \
  slides/<キー>/検査記録/phase-8.json \
  slides/<キー>/検査記録/phase-9.json \
  slides/<キー>/検査記録/phase-10.json \
  slides/<キー>/検査記録/phase-11.json
```

## Phase 12: 指摘統合・生成Skillへの修正委譲

### Step 12-1: 指摘統合・修正委譲・再レビュー

Phase 8、Phase 9、Phase 10、またはPhase 11で`status=fail`または`status=hold`が出た場合は、Phase 12で指摘を統合し、修正対象・保持必須情報・再確認方法を`generating-explanation-html-slides`へ引き渡す。このSkillは生成HTML・タイトル・副題・本文・図表・共有CSSを直接修正しない。要件変更を伴う場合は生成Skill Phase 1、伴わない場合はPhase 2から開始し、Phase 4の作成時機械検証・AIレビューを必ず通す。生成Skill Phase 6から戻った後、このSkillのPhase 7〜11をすべて再実行する。`status=blocked`は不足した実装・実行・証跡を解消するまで公開・commit不可とする。Phase 12は引き渡し前に4枝のJSONをschema検証し、対象HTMLごとにHTML共通の静的・実描画・AI JSONを`aggregate-html-review.mjs`で集約する。修正後に古いJSONを再利用してはならない。

完了条件: Phase 7〜11のPhase全体が連続して`pass`であり、許可された`not-applicable` criteriaには根拠があり、修正内容と反復回数を検査記録へ記載していること。

## Phase 13: 登録・蓄積簿更新

### Step 13-1: HTML・台帳・主題一覧・検査記録の登録

1. `slides/<スライドキー>/解説スライド.html`へ配置する。
2. `docs/スライド蓄積簿.md`の語彙一覧と照合し、11列形式で新規行を追加または既存行を更新する。
3. `docs/スライド主題一覧.md`へ主題を追加または更新する。
4. 検査記録へ、機械検証・観点レビュー・修正履歴を保存する。

完了条件: HTML、蓄積簿、主題一覧、検査記録の整合性が確認できること。

## Phase 14: サムネイル・カタログ生成

### Step 14-1: サムネイル・カタログ・一覧画像の生成と検証

1. `scripts/build-thumbs.mjs`でサムネイルを生成する。
2. `scripts/build-catalog.mjs`でカタログを再生成する。
3. 枚数、対象キー、タイトル、タグ、主題の埋め込みを確認する。
4. ローカル一覧をPlaywrightで開き、「もっと見る」を全展開して全画像を検証する。

`node .claude/skills/adding-catalog-slides/scripts/verify-catalog-preview.mjs`を実行し、表示件数とカード件数の一致、全展開後の画像件数一致、`naturalWidth > 0`、ブラウザエラー0、一覧スクリーンショット生成をblocking判定する。URL文字列の存在確認だけで画像ロードPASSにしてはならない。

完了条件: サムネイル・カタログ生成成功、`verify-catalog-preview.mjs`で全画像ロード成功・全件展開・一覧表示の機械検証PASS。ここではcommitしない。

## Phase 15: コミットゲート

### Step 15-1: 最終検証・証跡確認・commit

1. Phase 7〜14のPASS記録、4枝JSON、統合記録を確認する。
2. `npm test`をカタログ生成後の最終状態で実行し、静的検査・契約検査・レイアウト検査・一覧検査を全件PASSさせる。
3. `git diff --check`を実行する。
4. commit前hookで、機械検証PASS・観点レビュー記録・4枝JSON・証跡の存在・staged HTMLと記録のSHA一致を確認する。
5. 条件未達ならcommitを停止する。全条件PASS後、このPhaseでcommitする。
6. commit後は成果物を変更しない。HTML、タイトル、副題、本文、図表、共有CSSの変更が必要なら生成Skill Phase 1または2へ戻り、生成Skill Phase 1〜6と公開Skill Phase 7〜15をやり直す。タグ・台帳だけの変更またはHTMLを変えないサムネイル再生成はPhase 7へ戻る。

完了条件: Phase 7〜14とcommit前ゲートがPASSし、レビュー済み成果物がcommitで固定されていること。

## Phase 16: ユーザー提示・公開承認

### Step 16-1: commit固定済み成果物の提示・公開承認

1. Phase 15で固定したcommit SHAを明示する。
2. そのcommitから生成されたスライド画像、一覧画像、検査結果をユーザーへ提示する。
3. 提示後にHTML、タイトル、副題、本文、図表、共有CSSの修正依頼が出た場合は、要件変更を伴うなら`generating-explanation-html-slides` Phase 1、伴わないならPhase 2へ戻る。生成Skill Phase 1〜6と、このSkillのPhase 7〜15を再実行して新しいcommitを作る。タグ・台帳だけの変更またはHTMLを変えないサムネイル再生成はPhase 7へ戻る。提示済みcommitへ後付け変更しない。
4. push・公開する場合は、ユーザーの明示的な公開承認を得る。承認がなければcommit済み・未公開の状態で停止する。

完了条件: commit固定済み成果物をユーザーへ提示し、公開する場合は明示承認を得ていること。

## Phase 17: 公開後検証・完了報告

### Step 17-1: push・公開後Playwright検証・完了報告

1. Phase 16で公開承認されたcommitについて、`.git/slide-publish-approval.json`の`status=approved`と`approvedCommitSha=HEAD`を作成した後にpushしてGitHub Pagesへ反映する。承認記録がなければhookがpushを停止する。
2. 公開URL、個別HTML、サムネイル、一覧をPlaywrightで検証する。
3. 一覧画像数、`naturalWidth`、表示枠、代表スライドのHTTP 200を確認する。
4. push後のworktreeがcleanで、公開前のcommitと公開物の生成内容が一致することを確認する。
5. 検査結果と公開URLを報告する。

完了条件: 公開物のHTTP・画像ロード・一覧表示がPASSし、worktreeがcleanであること。

## 完了条件

| Phase | 完了条件 |
|---|---|
| Phase 7 | HTML共通の同期・静的・実描画・契約と、スライド固有3系統が終了コード0 |
| Phase 8 | 公開観点レビュー全行PASS |
| Phase 9 | デッキ全体レビュー全行PASS。単一スライドは根拠付き`not-applicable` criteria・Phase全体`pass` |
| Phase 10 | 情報過多・分割要否レビュー全行PASS |
| Phase 11 | 実務性・非テンプレ感レビュー全行PASS |
| Phase 12 | 指摘を生成Skillへ引き渡し、生成Skill Phase 1〜6と公開Skill Phase 7〜11を再PASS |
| Phase 13 | HTML・蓄積簿・主題一覧・検査記録が整合 |
| Phase 14 | サムネイル・カタログ・一覧画像がPASS |
| Phase 15 | 最終npm test、commit前ゲート、commitがPASS |
| Phase 16 | commit固定済み成果物をユーザーへ提示し、公開時は明示承認を取得 |
| Phase 17 | 公開後Playwright検証とworktree clean |
| **Goal** | 検証済みスライドが公開カタログで提示可能 |

## ループ設計

- 反復条件: Phase 7がFAILしたらPhase 7を`blocked`として所有箇所で解消し、Phase 7を再実行する。Phase 8、9、10、または11がFAILしたらPhase 12で指摘を統合し、生成Skill Phase 1または2へ修正を委譲する。生成Skill Phase 6完了後、Phase 7〜11をすべて再実行する
- 上限回数: 5回
- 停止条件: 全PASS、5回到達、同一FAILが2回連続

## 重要な注意事項

- 生成SkillのPhase 1〜6をこのSkillで再実行しない。
- レビュー結果を別Skillの実行済み報告で代用しない。
- 機械検証PASSだけで公開しない。観点レビューPASSも必須。
- Phase 15のcommit前にユーザー向け最終成果物を提示しない。
- 公開承認前にpushしない。ローカルcommitはレビュー済み成果物を提示前に固定するためPhase 15で実行する。
- `index.html`のカタログデータを手編集しない。

## 予想を裏切る挙動

- サムネイル生成が成功しても、一覧全件表示と画像ロードが失敗することがあるため、Phase 14のPlaywright検証を省略してはならない。
- AIレビュー指摘による修正でも生成Skill Phase 4の作成時レビューを通し、公開Skill Phase 7〜11をすべて再実行する。

## 参照資料

- `~/agent-home/skills/generating-explanation-html-slides/SKILL.md` — Phase 1〜6の生成工程
- `~/agent-home/skills/reviewing-explanatory-html/references/rules/html-output.md` — HTML共通ゲートの配布コピー
- `~/agent-home/skills/reviewing-explanatory-html/references/rules/html-editorial-quality.md` — HTML共通の編集品質詳細
- `~/agent-home/skills/reviewing-explanatory-html/references/rules/html-visual-explanation.md` — HTML共通の図表・視覚説明品質詳細
- `~/agent-home/skills/generating-explanation-html-slides/references/information-design-review-checklist.md` — Phase 8で全文適用する図表・情報設計レビュー正本
- `~/agent-home/skills/generating-explanation-html-slides/references/rules/html-slide.md` — グローバルHTMLスライド差分ruleの完全同期コピー
- `~/agent-home/skills/generating-explanation-html-slides/references/deck-level-art-direction-review.md` — Phase 9で全文適用するデッキ全体レビュー正本
- `~/agent-home/skills/generating-explanation-html-slides/references/existing-deck-split-review.md` — Phase 10で全文適用する情報過多・分割要否レビュー正本
- `~/agent-home/skills/generating-explanation-html-slides/references/practical-slide-editorial-review.md` — Phase 11で全文適用する実務性・非テンプレ感レビュー正本
- `~/agent-home/skills/generating-explanation-html-slides/scripts/verify-slide-contract.mjs` — 共通契約検証
- `~/agent-home/skills/generating-explanation-html-slides/scripts/verify-slide-static-contract.mjs` — 静的HTML・公開安全・登録整合性・保存済みサムネイル検証
- `~/agent-home/skills/generating-explanation-html-slides/scripts/qa-slide-layout.mjs` — desktop/mobile表示検証
- `docs/スライド蓄積簿.md` — タグ語彙と登録台帳
- `docs/スライド主題一覧.md` — 主題台帳

## 完了報告

`~/agent-home/skills/managing-agent-configs/references/skills/completion-report-format.md`の共通骨格に従い、Phase 7〜17のPASS結果、反復回数、commit SHA、公開した場合は公開URLを報告する。
