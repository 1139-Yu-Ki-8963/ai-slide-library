---
name: adding-catalog-slides
description: |
  解説スライドを登録し、検証・カタログ化・公開まで完遂する。
  TRIGGER when: 「スライドを追加」「カタログに登録」「スライドを作って載せて」と言われた時。既存スライドのHTML・内容・タイトル・副題・タグ・共有CSS・サムネイルを変更または再生成した時。
  SKIP: スライドの閲覧・検索のみの時、カタログ登録を伴わない生成のみの時。
invocation: adding-catalog-slides
type: orchestration
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion, mcp__playwright__*
---

# カタログスライド追加（adding-catalog-slides）

`generating-explanation-html-slides`が完了したHTMLを受け取り、Phase Aから開始して、検証・登録・公開までを完結させる。このSkillは公開成果物の品質確認を所有し、別のレビューSkillへ品質判定を委譲しない。

## 使用タイミング

- `ai-slide-library`でスライドを新規追加・更新し、公開カタログへ反映する時
- タイトル、本文、タグ、共有CSS、サムネイルを変更した時

## 運用注記

repo-export取り込み（`importing-repo-export-slides`）から引き継がれた場合は定型運用とする。定型運用の各項目は`importing-repo-export-slides`の「定型運用」節に従う。

## 前提

- HTML、タイトル、副題、本文、図表、共有CSSの新規作成・変更時は、`generating-explanation-html-slides`のPhase 1〜6完了が前提（Phase B）
- タグ・台帳だけの変更、またはHTMLを変更しないサムネイル再生成は生成工程（Phase B）を適用対象外とし、このSkillのPhase Aから開始する
- 生成Skillの成果物はリポジトリ内の単一共有CSSを直接参照するHTMLで、型・スライドキー・内容が確定していること
- Phase D完了前に、スライド画像、一覧画像、HTML、レビュー結果をユーザー向けの最終成果物として提示しないこと
- Phase Eでの承認がない限り、Phase F・Gの登録・生成・commit・pushへ進まないこと

## Phase A: 対象確定と承認

### Step A-1: 変更の分類

変更を追加・更新・削除に分類する。「既存のものを置き換える」のように更新とも削除とも読める表現を受けた場合、どちらかを確定してから進める。

### Step A-2: 削除の承認

削除がある場合、対象キーを全件列挙し、件数を明示してユーザーの承認を取る。承認された件数と実際に削除する件数が一致しない場合は実行しない。

| 操作 | 承認の取り方 |
|---|---|
| 追加 | 対象キーと枚数を提示 |
| 更新 | 対象キーと変更内容を提示 |
| 削除 | 対象キーを全件列挙し、件数を明示して個別承認 |

### Step A-3: 追加・更新対象の確定

追加・更新の対象キーを確定する。

### Step A-4: 検証範囲の判定

変更の種類ごとに、Phase C（機械検証）・Phase D（AIレビュー）・敵対的検証の実行範囲を次の表で決める。全件母集団への検証を既定にしない。

| 変更の種類 | 機械検証（Phase C） | AIレビュー（Phase D） | 敵対的検証 |
| --- | --- | --- | --- |
| 台帳・語彙のみ（HTML不変） | カタログ整合のみ | なし | なし |
| 1〜3枚の更新 | 対象枚のみ | 対象枚のみ | PR差分のみ |
| 新規追加・型追加 | 対象枚＋全件の契約検査 | 対象枚のみ | 必須 |
| 共有シェル・共有JavaScriptの変更 | 全件 | 代表3枚 | 必須 |

- 共有シェルの変更だけが全件検証を要する。全スライドが同じCSSを直接参照するため、1箇所の変更が全枚に及ぶためである。
- 台帳・語彙のみの変更（HTML不変）の場合、Phase BとPhase Dを実行しない。Phase Cは`SLIDE_VERIFY_REGISTRY=0`を指定したnpm testでカタログ・蓄積簿・主題一覧の整合検査のみを実行し、スライド本体の静的・実描画検査は対象外とする。HTMLが変わらない変更に、図表・情報設計のレビューを適用する意味がないため、AIレビューと敵対的検証は実行しない。

完了条件: 変更が追加・更新・削除に分類され、削除がある場合は対象キー全件の承認件数と実行予定件数が一致していること。変更の種類（台帳・語彙のみ／1〜3枚の更新／新規追加・型追加／共有シェル・共有JavaScriptの変更）が判定され、Phase C・Phase D・敵対的検証の実行範囲が確定していること。

## Phase B: 生成・更新

### Step B-1: 生成Skillの実行

HTML、タイトル、副題、本文、図表、共有CSSを新規作成・変更する場合、`generating-explanation-html-slides`のPhase 1〜6を実行する。生成Skillの成果物はリポジトリ内の単一共有CSSを直接参照するHTMLで、型・スライドキー・内容が確定していること。生成SkillのPhase 1〜6をこのSkillで再実行しない。

Phase AのStep A-4で「台帳・語彙のみ（HTML不変）」と判定された変更、またはHTMLを変更しないサムネイル再生成は、本Phaseを適用対象外とし、Phase Cから開始する。repo-export取り込み由来（`importing-repo-export-slides`のルートB・C）のHTMLも本Phase（生成Skillの実行）の適用対象外とする。取り込み時点で補正・検証済みで引き継がれるためである。

完了条件: 対象がHTML変更を伴う場合、生成Skill Phase 1〜6が完了していること。台帳・語彙のみの変更、HTML不変のサムネイル再生成、またはrepo-export取り込み由来のHTMLは本Phase適用対象外として扱われていること。

## Phase C: 機械検証（止める）

Phase Cは本フロー中に2回実行する。1回目はPhase B完了後、Phase D開始前。2回目はPhase F完了後、Phase Gでcommitする直前（Fが生成したカタログ・サムネイル・台帳の対応の整合に限定した再実行）。

### Step C-1: HTML共通・スライド固有の機械検証

生成・更新された全対象と、既存カタログ全件を対象に、グローバルSkill配下の検証スクリプトを実行する。

各対象HTMLについて、次のHTML共通検証も実行し、JSON証跡を保存する。

1. `sync-html-rule-copies.mjs`
2. `verify-html-static.mjs <対象HTML>`
3. `verify-html-runtime.mjs <対象HTML>`
4. `verify-html-review-contract.mjs`

いずれかが未実装、未実行、証跡なし、終了コード非0ならPhase Cを`blocked`とし、Phase D以降へ進まない。HTML、タイトル、副題、本文、図表、共有CSSの修正が必要なら`generating-explanation-html-slides` Phase 2へ戻す。生成Skill Phase 4のレビューを経てPhase Cを再実行する。検査スクリプトまたは登録情報の不備は、その所有箇所で解消してPhase Cを再実行する。Phase CのFAILをStep D-5へ送らない。共通AIレビュー後の集約はStep D-5で対象HTMLごとに`aggregate-html-review.mjs`を実行する。

実行:

```bash
npm run sync:slide-shell
SLIDE_VERIFY_REGISTRY=0 SLIDE_VERIFY_CATALOG=0 npm test
```

検査内容:

- `npm run sync:slide-shell`を生成・修正工程として明示実行する。定義CSS・JavaScriptを`assets/shared-slide-shell.css`・`assets/shared-slide-shell.js`へ同期する。全HTMLの参照を各1回へ統一する。`npm test`、`pretest`、`posttest`から同期・生成・修正しない
- `slide-inventory.mjs`を全スライド検査の唯一の母集団とし、再帰列挙したpath・SHA-256・inventory digestを全checkerで一致させる。別名HTML、refresh文書、symlink、母集団digest不一致はfail closedで停止する
- `slide-mechanical-registry.json`と`verify-slide-mechanical-registry.mjs`で契約を照合する。対象は全契約ファイル、規約文、criterion/check、checker、単独違反fixture、npm test到達性であり、これらを全数照合する
- `verify-slide-shell-completeness.mjs`で全HTML・全論理ページ・全外枠候補を母集団化する。共有/許可済み本文/禁止の未分類0件、定義とのbyte一致を検査する。規約・criterion・正常fixture・単独違反fixture・実行経路の1対1対応も検査する
- `test-slide-shell-completeness.mjs`で全機械criterionを1件ずつ単独破壊し、mutation survivor 0件を確認する
- `verify-slide-shell-runtime.mjs`で、共有フッター・共有ページ送り・現在/総数・前後ボタン・左右キーを全ページ状態で実操作し、全遷移とcomputed styleを検査する
- `test-slide-shell-runtime-contract.mjs`で実行時規約の全機械checkを1件ずつ単独破壊し、mutation survivor 0件を確認する
- `verify-slide-rule-enforcement.mjs`で、ヘッダー規約1件・criterion 1件・checker・正常/違反fixture・証跡・公開ゲートの完全対応を検査する
- `verify-slide-header-contract.mjs`で、HTMLファイル数・DOMヘッダー数とは独立に全論理ページ状態を検出して母数にし、共有ヘッダーも各状態で再検査する。DOM、文字数、改行、実描画行数、文字列内包、座標、computed style、子要素、疑似要素、inline style、`!important`を定義と比較する。指定フォントとFontFaceの利用可能性も比較する
- 全スライドが`assets/shared-slide-shell.css`を1つだけ直接参照し、共有CSSのインライン複製が0件で、公開用CSSがグローバル定義と完全一致すること
- タイトル40文字以内、副題70文字以内、両方に強制改行がなく、実描画1行かつ文字列描画矩形がスライド内に収まること
- タイトル・副題・フッターのcomputed値が共通契約と一致すること
- 1280×720のスライドサイズ、ヘッダー・タイトル・フッターの内包
- desktop/mobileのoverflow、全体縮小、欠落、JavaScriptエラー
- 640×360サムネイルのPNG寸法、白紙率、内容
- 新規追加前は台帳・カタログ未生成のため、カタログ突合を除外してスライド本体を検証する

Phase Cの検査項目には、グローバルSkillの`verify-slide-static-contract.mjs`による以下も含む。

- `<title>`、未確定トークン、個人環境・セッションパス、外部アセット依存
- 保存済み`サムネイル.png`の640×360寸法
- 既存登録時のスライドキーと蓄積簿・主題一覧の集合一致

完了条件（1回目・Phase D開始前）: 明示的な同期後、追加前は`SLIDE_VERIFY_REGISTRY=0 SLIDE_VERIFY_CATALOG=0 npm test`を実行する。スライド本体3系統と全論理ページ状態のヘッダー契約を通過すること。検査前後で`git diff`が増えず、全checkerのinventory digestが一致すること。ヘッダー契約は、独立検出した論理ページ状態数と検査済みページ状態数の一致、各状態に対応するヘッダーの存在を必須とする。台帳・語彙のみの変更（HTML不変）の場合はPhase A Step A-4の判定に従い、カタログ・蓄積簿・主題一覧の整合検査のみを通過させる。

完了条件（2回目・Phase G直前）: Phase FのStep F-1・F-2完了後、環境変数なしの`npm test`で台帳・主題一覧・カタログを含む全件を通過すること。この再実行で止めるのは、Fが生成した成果物の整合（カタログ・サムネイル・台帳の対応）に限る。Phase Eで承認済みのスライド本体の内容自体は再判定しない。

## Phase D: AIレビュー（止めない）

AIレビューの役割は判断材料の提供であり拒否権ではない。所見は`検査記録/phase-8.json`〜`phase-11.json`と`html-common-ai.json`へ保存する。Phase Dは公開を止めない。Phase Dで`critical`判定が1件でも出た場合のみ、Phase Eでの提示時に「重大な指摘あり」と明示する。修正するかどうかはユーザーがPhase Eで判断する。

### Step D-1: 単一スライドの図表・情報設計レビュー

このSkill自身が、公開前レビューの観点と判定を完結させる。別のレビューSkillは呼び出さない。

次の資料を全文で読む。グローバルの配布コピーは`reviewing-explanatory-html/references/rules/html-editorial-quality.md`である。`html-visual-explanation.md`も配布コピーとして読む。スライド差分`generating-explanation-html-slides/references/rules/html-slide.md`も読む。`information-design-review-checklist.md`も全文で読む。このSkill自身が`artifact-review`相当の内容・表示・実装・安全性を判定し、別のレビューSkillは呼ばない。要約して観点を減らしてはならない。

1. レビュー前の内部確認16項目を整理する。項目は目的、読み手、役割、結論、階層、図形関係、線の意味、色の意味、グラフ・表の読み方、装飾、保持情報、適用箇所、HTML構造、共通レイアウト、縮小・カタログ認識、関連ファイルである。
2. 図形、矢印・接続線、文字、配色・アクセシビリティ、視線の流れ、整列、余白を確認する。
3. グラフがある場合はデータの視認性、線の強弱、軸・凡例・単位・目盛・注釈、直接ラベル、比較軸、数値・出典、グラフ種別、誤解を招く軸を確認する。
4. 表がある場合は罫線、行の区別、項目・整数・小数の整列、単位、塗り分け、強調、項目・数値・注釈・出典、HTML`table`構造を確認する。
5. カード乱立、項目ごとの無意味な色分け、大きな矢印、グラデーション、立体図形、無関係な人物イラスト、均等配置だけの構成を確認する。
6. 主張、数値、固有名詞、単位、期間、条件、注釈、出典、凡例、軸、表項目、比較対象、因果関係、前提条件が維持されているかを元資料と照合する。
7. 16:9、縮小、サムネイル、カタログ、編集可能性、配置・命名・台帳整合性・公開安全性を確認する。
8. タイトルが主張または判断対象を示し、副題が範囲・前提・比較軸・根拠・読み方を補っているか、相互の重複と本文への押し込みがないかを確認する。文字数・行数の機械PASSだけで意味品質をPASSにしない。

各指摘は「対象箇所 / 問題 / 理由 / 影響 / 必要な修正 / 修正後確認」で記録する。結果は対象、要約、良い点、指摘事項、情報設計の再編集案、観点別チェック、実装可能な優先順位付き修正方針、ai-slide-library適合性、次のアクションを持つ。ユーザーの明示的な修正依頼がない限り、レビュー中にHTML・CSS・画像・カタログ・サムネイルを変更しない。

HTML共通12 criteriaの結果はAI JSONとして保存する。JSONは`reviewing-explanatory-html/references/html-review-record.schema.json`へ完全準拠する。保存先は対象ごとに`slides/<キー>/検査記録/html-common-ai.json`である。`artifact`は対象HTMLのパス、`artifactSha256`はPhase Cの静的・実描画JSONと同じSHA-256、`checks`は共通12 criteriaを重複・欠落なく1件ずつ持つ。Step D-1固有の図表・情報設計結果は従来どおり`phase-8.json`へ分離し、共通AI JSONの代用にしない。

単一スライドの図表・情報設計だけを対象にする。デッキ全体レビューはStep D-2、情報過多・分割要否はStep D-3、実務性・非テンプレ感はStep D-4で実施し、ここで再実行しない。複数ページでデッキ文脈がある場合も、Step D-1ではページ単位の図表・情報設計に限定する。

各指摘は共通判定schemaで記録する。`severity`は`critical` / `high` / `medium` / `low`のいずれかである。`decision`は`fail` / `hold` / `pass` / `suggestion`のいずれかである。旧来の`P0〜P3`や「重大・要修正」は出力時にこのschemaへ正規化する。

レビューのみでは承認なしにHTML・CSS・画像・カタログを変更しない。

### Step D-2: デッキ全体・アートディレクションレビュー

グローバルSkillの`references/deck-level-art-direction-review.md`を全文の定義として読み、全観点を適用する。以下の箇条書きは重点項目であり、全文レビューの代用にしない。Step D-1、D-3、D-4とは統合しない。

対象観点:

- タイトル・ヘッダー・フッターの統一性
- 余白、文字サイズ、視線誘導、情報密度
- 図表の読み順、軸・凡例・単位・数値の整合性
- 既存スライド更新時の情報欠落0件
- 指示された変更の反映漏れ0件
- AI生成物に見える不自然なカード乱立、装飾過多、曖昧な主張の有無
- 公開HTMLに個人名、顧客名、端末固有情報、絶対パスがないこと

レビューはPlaywrightで1280×720の実描画を取得し、`slides/<スライドキー>/evidence/検証用スクリーンショット.png`へ保存する。対象スライドを観点表に1行ずつ記録する。判定は共通schemaの`decision`で記録し、検査記録へ保存する。Step D-2は公開を止めない。所見はPhase Eでの提示材料とする。

完了条件: 対象範囲、デッキ全体評価、各ページ評価、共通schemaの指摘、最終判定、レビュー用スクリーンショットが検査記録へ保存されていること。単一スライドでデッキ文脈がない場合はStep D-2の3 criteriaを根拠付き`not-applicable`、Step全体を`pass`として記録する。

### Step D-3: 既存スライド・デッキの情報過多・分割要否レビュー

既存HTMLスライドを資料全体として確認する。グローバルSkillの`references/existing-deck-split-review.md`を全文の定義として読み、ユーザーが指定したファイル・ディレクトリだけを対象にする。Step D-2のアートディレクションレビューとは統合しない。単一スライドでも、1ページ1メッセージ、情報密度、文字の押し込み、分割・移動の要否を必ず判定する。

レビューでは、対象・HTML構造・実描画・サムネイル・検査記録・関連プロンプト・前後関係を確認し、資料全体の主張、読み手の判断、ページ順、1ページ1メッセージ、主張と根拠、重複・欠落・順序を判定する。各スライドの仮主題、情報構造、図解候補、別ページへ移す情報、不要情報を記録する。

特に、現状・原因・解決策・実施方法・効果・費用の混在、表・工程・体制・数値・関係図の同居、主要数値と根拠の過多、小さな文字への押し込みを検出する。分割・統合・移動の提案は、主張、根拠、数値、単位、条件、出典、因果関係を保持する前提で作成する。一覧・台帳・定義・体制・付録など網羅性が価値のページは、単純な削減対象にしない。

判定は共通schemaの`severity`と`decision`で記録し、検査記録へ保存する。Step D-3は公開を止めない。所見はPhase Eでの提示材料とする。指摘は対象ファイル、スライドキー、対象箇所、問題、根拠、影響、必要な修正、修正後の確認方法で検査記録へ保存する。レビューのみではHTML・CSS・画像・台帳・カタログを変更しない。

完了条件: 分割・統合・移動の要否、保持必須情報、優先順位、最終判定が記録され、対象範囲が明示されていること。単一スライドも適用対象とし、根拠付きで分割不要と判定した場合のみPASSとする。

### Step D-4: 実務性・非テンプレ感レビュー

既存スライドがテンプレートへ情報を流し込んだだけでなく、実務で使用できる編集済み資料になっているかを確認する。グローバルSkillの`references/practical-slide-editorial-review.md`を全文の定義として読む。Step D-1の図表レビュー、Step D-2のデッキ全体レビュー、Step D-3の分割要否レビューとは統合しない。

主張、情報の主従、読み順、論証、余白、文字組み、配置、視覚的強弱、カード・アイコン・写真・色・フッター・多角形・グラデーションなどのテンプレ表現、会議利用性を判定する。元にない会社名、日付、ロゴ、数値、効果、費用、期間、キャッチコピー、注釈、写真、根拠のない図解を追加しない。

判定は共通schemaの`severity`と`decision`で記録する。14項目の最終チェックを実施し、情報設計の再編集案として主役、支える情報、後景化、レイアウト、読み順、削除・統合・短縮候補、追加禁止情報を検査記録へ保存する。レビューのみではHTML・CSS・画像・台帳・カタログを変更しない。

完了条件: 14項目の最終チェック、指摘、実務利用性の総合判定、修正方針が検査記録へ保存されていること。

### Step D-1〜D-4の並列実行

Phase Cの機械検証を先行ゲートとし、PASS後にStep D-1〜D-4を独立したレビュー枝として並列実行する。Phase・Step番号と責務は分けたまま、実行順だけを並列化する。

```text
Phase C 機械検証
       ├─ Step D-1 単一スライド図表・情報設計
       ├─ Step D-2 デッキ全体・アートディレクション
       ├─ Step D-3 情報過多・分割要否
       └─ Step D-4 実務性・非テンプレ感
                    ↓
       Step D-5 指摘統合・記録の確定
```

ヘッダー共有領域だけの一括変更では、Phase・Step番号と4枝の責務を維持する。グローバルSkillの`refresh-header-only-review-evidence.mjs`で影響限定再検証ができる。必須入力は次の6点である。現SHAに対するHTML共通static/runtime全件PASS。全論理ページ状態のヘッダーlinter全件PASS。ヘッダーAI 3 criteria全件PASSまたは根拠付きN/A。HEAD比較による非ヘッダーmarkup・型固有CSS不変。再生成済みサムネイル・1280×720証跡。カタログ一覧画像によるヘッダー・本文境界のAI影響レビュー。AIレビューはheader report SHA、全HTML SHA、一覧画像SHAへ固定する。スクリプトはHEADのStep D-1〜D-4に対応するphase-8〜11のJSONを定義として差分影響だけを現SHAへ再発行する。各Stepのschemaと HTML共通aggregateを再検証する。本文差分、母数不一致、旧SHA、FAIL、証跡未生成を1件でも検出したら停止し、通常のStep D-1〜D-4レビューへ戻る。この経路でも4つのStepを統合・省略してはならない。

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

Step D-1〜D-4は同一のHTML、実描画、サムネイルを読み取り専用で入力し、各枝は他枝の検査記録を書き換えない。各枝は次のJSON契約で`検査記録/phase-<N>.json`を1つだけ返す（ファイル名・schemaの`phase`番号は従来どおり8〜11を維持する）。

- Step D-1（phase 8）: `slide-ai-thumbnail-legibility`と`slide-ai-one-message`である。`slide-ai-title-claim`と`slide-ai-subtitle-support`も含む。
- Step D-2（phase 9）: `deck-ai-role-sequence`、`deck-ai-strength-rhythm`、`deck-ai-layout-repetition`
- Step D-3（phase 10）: `deck-ai-split-plan`
- Step D-4（phase 11）: スライド差分criteriaは空配列。実務性・非テンプレ感はHTML共通criteriaとStep D-4の`findings`で保持する

`not-applicable`はcriteria単位でのみ使用し、対象外の理由を`evidence`へ記録する。Step全体の`status`は`pass`とする。Step D-2はデッキ文脈がない単一スライドに限りこの扱いを許可する。Step D-1、D-3、D-4をスライド単位で適用対象外にしてはならない。

複数スライドを対象にする場合は、上記のStep D-1〜D-4間の並列化（1スライド内の4枝の並列実行）に加えて、スライド間も並列化する。検査記録のAIレビュー（phase-8〜11・html-common-aiの判定）は1スライドあたり約4分かかるため、1スライド=1担当者で並列に委任する。複数件を1担当者へ直列で渡すと件数倍の壁時計時間になる（2026-07-30実測: 7件を3+4の2分割直列で32分。7並列なら約5分）。

対象ごとに次を実行し、終了コード0を必須とする。

```bash
node ~/agent-home/skills/generating-explanation-html-slides/scripts/verify-slide-ai-review-contract.mjs \
  slides/<キー>/検査記録/phase-8.json \
  slides/<キー>/検査記録/phase-9.json \
  slides/<キー>/検査記録/phase-10.json \
  slides/<キー>/検査記録/phase-11.json
```

### Step D-5: 指摘統合・記録の確定

Step D-1〜D-4の所見を統合し、`検査記録/`へ保存する。所見に`fail`または`hold`が含まれる場合も、このSkillは生成HTML・タイトル・副題・本文・図表・共有CSSを直接修正しない。修正の実施と、生成Skillへの修正委譲の要否は、Phase Eでユーザーが判断する。ユーザーが修正を求めた場合、要件変更を伴うなら`generating-explanation-html-slides` Phase 1、伴わないならPhase 2から開始する。生成Skill Phase 4の作成時機械検証・AIレビューを必ず通す。生成Skill Phase 6から戻った後、このSkillのPhase B以降（Phase C・Phase D）をすべて再実行し、改めてPhase Eで提示する。

`status=blocked`（実装・実行・証跡の不足による評価不能）は所見の重大度とは別に扱う。所有箇所（該当スクリプト・検査記録の欠落箇所）で解消し、Step D-5を再実行してからPhase Eへ進む。

Step D-5は引き渡し前に4枝のJSONをschema検証し、対象HTMLごとにHTML共通の静的・実描画・AI JSONを`aggregate-html-review.mjs`で集約する。修正後に古いJSONを再利用してはならない。

完了条件: 4枝のJSON、HTML共通集約（`html-common-ai.json`等）が対象ごとに`検査記録/`へ保存されていること。許可された`not-applicable` criteriaには根拠があること。過去に修正・再実行があれば、その内容と反復回数を検査記録へ記載していること。

## Phase E: ユーザー提示と承認（最終判断）

### Step E-1: 実物HTMLの提示

実物HTML、スライド画像、一覧画像をローカルサーバー等でユーザーへ提示する。Phase Eはcommit前に行うため、commit SHAはまだ存在しない。Phase C・Phase Dの検査結果を合わせて提示する。

### Step E-2: Phase Dの所見を添える

Step D-1〜D-4の所見を要約して提示に添える。Phase Dで`critical`判定が1件でもあった場合は「重大な指摘あり」と明示する。

### Step E-3: 承認を取る

1. 提示後にHTML、タイトル、副題、本文、図表、共有CSSの修正依頼が出た場合、要件変更を伴うなら`generating-explanation-html-slides` Phase 1へ戻る。伴わないならPhase 2へ戻る。生成Skill Phase 1〜6完了後、このSkillのPhase B以降（Phase C・Phase D）をすべて再実行し、改めてPhase Eで提示する。
2. 修正依頼がなく、ユーザーの明示的な承認を得た場合、Phase F・Gへ進む。
3. 承認がなければPhase F・Gへ進まない。

完了条件: 実物成果物とPhase Dの所見をユーザーへ提示し、承認、または修正のためのPhase Bへの差し戻しのいずれかを得ていること。

## Phase F: 登録・生成

### Step F-1: HTML・台帳・主題一覧・検査記録の登録

1. repo-export経由（`importing-repo-export-slides`のルートB・C）の場合は、同スキルのStep 4-2で配置済みであることを実体と台帳の突合で確認する。このSkill単独起動（新規スライドの直接登録）の場合は、このSkillが`slides/<スライドキー>/解説スライド.html`へ配置する。
2. `docs/スライド蓄積簿.md`の語彙一覧と照合し、11列形式で新規行を追加または既存行を更新する。
3. `docs/スライド主題一覧.md`へ主題を追加または更新する。
4. 検査記録へ、機械検証・観点レビュー・修正履歴を保存する。

完了条件: HTML、蓄積簿、主題一覧、検査記録の整合性が確認できること。

### Step F-2: サムネイル・カタログ生成

1. `scripts/build-thumbs.mjs`でサムネイルを生成する。
2. `scripts/build-catalog.mjs`でカタログを再生成する。
3. 枚数、対象キー、タイトル、タグ、主題の埋め込みを確認する。
4. ローカル一覧をPlaywrightで開き、「もっと見る」を全展開して全画像を検証する。

`node .claude/skills/adding-catalog-slides/scripts/verify-catalog-preview.mjs`を実行する。表示件数とカード件数の一致、全展開後の画像件数一致、`naturalWidth > 0`、ブラウザエラー0、一覧スクリーンショット生成をblocking判定する。URL文字列の存在確認だけで画像ロードPASSにしてはならない。

完了条件: サムネイル・カタログ生成成功、`verify-catalog-preview.mjs`で全画像ロード成功・全件展開・一覧表示の機械検証PASS。ここではcommitしない。

## Phase G: コミット・公開

### Step G-1: 最終検証・commit

1. Phase B〜Fの実行記録（Phase C・Phase Dの検査記録、4枝JSON、Phase Fの生成結果）を確認する。
2. `npm test`をカタログ生成後の最終状態で実行し、静的検査・契約検査・レイアウト検査・一覧検査を全件PASSさせる（Phase Cの2回目の実行）。
3. `git diff --check`を実行する。
4. commit前hookで、機械検証PASS・観点レビュー記録・4枝JSON・証跡の存在・staged HTMLと記録のSHA一致を確認する。
5. 条件未達ならcommitを停止する。ここで止めるのは、Fが生成した成果物の整合（カタログ・サムネイル・台帳の対応）に限る。Phase Eで承認済みのスライド本体を再判定しない。
6. 全条件PASS後、このStepでcommitする。commit後は成果物を変更しない。HTML、タイトル、副題、本文、図表、共有CSSの変更が必要なら生成Skill Phase 1または2へ戻り、生成Skill Phase 1〜6と公開Skill Phase B〜Gをやり直す。タグ・台帳だけの変更、あるいはHTMLを変えないサムネイル再生成はPhase Cへ戻る。

完了条件: Phase B〜Fとcommit前ゲートがPASSし、レビュー済み成果物がcommitで固定されていること。

### Step G-2: push・PR作成・マージ・デプロイ確認・公開後検証・完了報告

1. `.git/slide-publish-approval.json`は、Phase EでAskUserQuestionによりユーザーから公開の明示承認を得た場合にのみ、その承認の記録として作成する。作成時は`status=approved`と`approvedCommitSha=HEAD`を設定してからpushする。承認記録がなければhookがpushを停止する。
   - この承認ファイルはユーザーの公開承認を担保する関門であり、明示承認を得ずに作成することを禁止する。承認後の作成は承認の記録に限られ、絶対的な作成禁止を意味しない。pushが承認不在でhookにblockされた場合は、回避せずユーザーへ承認を諮って止まる。承認前の代行作成は承認の経路そのものを無効化する（2026-07-30に発生し、ファイル削除とユーザーの明示指示による再実行で復旧した実例がある）。
2. pushしたブランチからPRを作成する。ユーザーの明示承認を得たうえでマージする。マージのみで完了とせず、次の検証まで完遂する。
3. マージ後、GitHub Pagesのデプロイ完了を確認する。`gh run list`でdeployワークフローの`success`を確認するか、`gh api repos/<owner>/<repo>/pages`でデプロイ状況を確認する。
4. デプロイ完了を確認したうえで、公開URL、個別HTML、サムネイル、一覧をPlaywrightで検証する。マージだけして表示未確認のまま完了報告することを禁止する。
5. 一覧画像数、`naturalWidth`、表示枠、代表スライドのHTTP 200を確認する。
6. マージ後のworktreeがcleanで、公開前のcommitと公開物の生成内容が一致することを確認する。
7. 検査結果と公開URLを報告する。

完了条件: PRがマージされ、GitHub Pagesのデプロイ完了を確認したうえで公開物のHTTP・画像ロード・一覧表示がPASSし、worktreeがcleanであること。

## 完了条件

| Phase | 完了条件 |
|---|---|
| Phase A | 変更が追加・更新・削除に分類され、削除がある場合は対象キー全件の承認件数と実行予定件数が一致していること。変更の種類が判定され、Phase C・Phase D・敵対的検証の実行範囲が確定していること |
| Phase B | 対象がHTML変更を伴う場合、生成Skill Phase 1〜6が完了していること。台帳・語彙のみの変更は本Phase適用対象外として扱われていること |
| Phase C | （1回目）HTML共通の同期・静的・実描画・契約と、スライド固有3系統が終了コード0。台帳・語彙のみの変更はカタログ整合検査のみが終了コード0であること |
| Phase D | Step D-1〜D-4の所見が`検査記録/phase-8.json`〜`phase-11.json`と`html-common-ai.json`へ保存されていること。所見の重大度は公開可否を決めない |
| Phase E | 実物成果物とPhase Dの所見をユーザーへ提示し、承認、または修正のためのPhase Bへの差し戻しのいずれかを得ていること |
| Phase F | HTML・蓄積簿・主題一覧・検査記録が整合し、サムネイル・カタログ・一覧画像がPASSしていること |
| Phase G | Phase Cの2回目の実行（環境変数なしの`npm test`）、`git diff --check`、commit前ゲートがPASSし、commit・push・PRマージ・デプロイ完了確認・公開後Playwright検証・worktree cleanが完了していること |
| **Goal** | 検証済みスライドが公開カタログで提示可能 |

## ループ設計

- 反復条件: Phase CがFAILしたらPhase Cを`blocked`として所有箇所で解消し、Phase Cを再実行する。Phase Dの所見を踏まえてユーザーがPhase Eで修正を要求した場合、生成Skill Phase 1または2へ修正を委任する。生成Skill Phase 6完了後、Phase B以降（Phase C・Phase D）をすべて再実行し、改めてPhase Eで提示する。
- 上限回数: 5回
- 停止条件: Phase Cが全PASSしPhase Eでユーザーが承認、5回到達、同一FAILが2回連続

## 重要な注意事項

- 生成SkillのPhase 1〜6をこのSkillで再実行しない。
- レビュー結果を別Skillの実行済み報告で代用しない。
- 機械検証（Phase C）PASSと、Phase Eでのユーザー承認の両方がなければ公開しない。Phase D（AIレビュー）のPASSは公開の必須条件ではない。
- Phase D完了前にユーザー向け最終成果物を提示しない。
- Phase Eの承認前にPhase F・Gへ進まない。commitはPhase Eでの提示・承認の後、Phase Gで行う。
- 公開承認前にpushしない。
- `index.html`のカタログデータを手編集しない。

## 予想を裏切る挙動

- サムネイル生成が成功しても、一覧全件表示と画像ロードが失敗することがあるため、Phase FのPlaywright検証を省略してはならない。
- AIレビュー指摘による修正でも生成Skill Phase 4の作成時レビューを通し、公開Skill Phase B〜D（生成・機械検証・AIレビュー）をすべて再実行する。
- カタログの`updated`はビルド時点のgit履歴から算出される。スライド変更と同一commitで再生成した場合、公開される更新日は1変更分古くなる（既知の制限）。

## 参照資料

| 資料 | 用途 |
|---|---|
| `~/agent-home/skills/generating-explanation-html-slides/SKILL.md` | Phase 1〜6の生成工程 |
| `~/agent-home/skills/reviewing-explanatory-html/references/rules/html-output.md` | HTML共通ゲートの配布コピー |
| `~/agent-home/skills/reviewing-explanatory-html/references/rules/html-editorial-quality.md` | HTML共通の編集品質詳細 |
| `~/agent-home/skills/reviewing-explanatory-html/references/rules/html-visual-explanation.md` | HTML共通の図表・視覚説明品質詳細 |
| `~/agent-home/skills/generating-explanation-html-slides/references/information-design-review-checklist.md` | Step D-1で全文適用する図表・情報設計レビュー定義 |
| `~/agent-home/skills/generating-explanation-html-slides/references/rules/html-slide.md` | グローバルHTMLスライド差分ruleの完全同期コピー |
| `~/agent-home/skills/generating-explanation-html-slides/references/deck-level-art-direction-review.md` | Step D-2で全文適用するデッキ全体レビュー定義 |
| `~/agent-home/skills/generating-explanation-html-slides/references/existing-deck-split-review.md` | Step D-3で全文適用する情報過多・分割要否レビュー定義 |
| `~/agent-home/skills/generating-explanation-html-slides/references/practical-slide-editorial-review.md` | Step D-4で全文適用する実務性・非テンプレ感レビュー定義 |
| `~/agent-home/skills/generating-explanation-html-slides/scripts/verify-slide-contract.mjs` | 共通契約検証 |
| `~/agent-home/skills/generating-explanation-html-slides/scripts/verify-slide-static-contract.mjs` | 静的HTML・公開安全・登録整合性・保存済みサムネイル検証 |
| `~/agent-home/skills/generating-explanation-html-slides/scripts/qa-slide-layout.mjs` | desktop/mobile表示検証 |
| `docs/スライド蓄積簿.md` | タグ語彙と登録台帳 |
| `docs/スライド主題一覧.md` | 主題台帳 |

## 完了報告

完了報告は共通骨格に従う。骨格は`~/agent-home/skills/managing-agent-configs/references/skills/completion-report-format.md`を使う。Phase A〜GのPASS結果、反復回数、commit SHA、公開した場合は公開URLを報告する。
